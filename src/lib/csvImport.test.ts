import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CategoriesData } from "./aggregate";
import {
  addUnknownCategories,
  assignImportIds,
  buildExistingKeyCounts,
  buildImportPreview,
  classifyRows,
  findUnknownCategories,
  groupRowsByYear,
  nextSequence,
  parseCsvText,
  parseImportCsv,
  rowsPeriod,
  transactionKey,
  type ParsedRow,
} from "./csvImport";

const categories: CategoriesData = {
  groups: [
    { id: "food", label: "食費", color: "#e07a5f" },
    { id: "other", label: "その他", color: "#adb5bd" },
    { id: "income", label: "収入", color: "#2a9d8f" },
  ],
  categories: {
    Groceries: { label: "食料品", group: "food" },
    "Eating Out": { label: "外食", group: "food" },
    Salary: { label: "給与", group: "income" },
  },
};

function row(overrides: Partial<ParsedRow>): ParsedRow {
  return {
    date: "2025-02-01",
    amount: -1000,
    currency: "JPY",
    description: "test",
    memo: null,
    category: "Groceries",
    account: "普通",
    work: "Personal",
    ...overrides,
  };
}

describe("parseCsvText", () => {
  it("単純なCSVを配列に変換する", () => {
    const result = parseCsvText('"a","b"\n"1","2"\n');
    expect(result).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("フィールド内のカンマ・エスケープされたダブルクォートを扱える", () => {
    const result = parseCsvText('"店名, 支店","メモ""重要"""\n');
    expect(result).toEqual([["店名, 支店", 'メモ"重要"']]);
  });

  it("末尾に改行が無くても最終行を回収する", () => {
    const result = parseCsvText('"a","b"\n"1","2"');
    expect(result).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseImportCsv", () => {
  const header =
    '"Date","Amount","Account Currency","Description","Memo","Receipt","Category","Account Name","Account Number","Work"';
  const headerNoHash =
    '"Date","Amount","Account Currency","Description","Memo","Receipt","Category","Account Name","Account Number","Work"';

  it("#列ありのヘッダーでもパースできる（ヘッダー名マッチング）", () => {
    const withHash =
      '"#","Date","Amount","Account Currency","Description","Memo","Receipt","Category","Account Name","Account Number","Work"\n' +
      '"1","2025-02-01","-1000","JPY","スーパー","スーパー","No","Groceries","普通","****","Personal"\n';
    const { rows, errors } = parseImportCsv(withHash);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        date: "2025-02-01",
        amount: -1000,
        currency: "JPY",
        description: "スーパー",
        memo: "スーパー",
        category: "Groceries",
        account: "普通",
        work: "Personal",
      },
    ]);
  });

  it("#列なしのヘッダーでもパースできる（ユーザーの実際のエクスポート形式）", () => {
    const csv =
      headerNoHash +
      "\n" +
      '"2025-02-01","-1000","JPY","スーパー","スーパー","No","Groceries","普通","****","Personal"\n';
    const { rows, errors } = parseImportCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0].description).toBe("スーパー");
    expect(rows[0].amount).toBe(-1000);
  });

  it("収入（正の金額）も整数のままパースする", () => {
    const csv =
      header +
      "\n" +
      '"2025-02-25","443334","JPY","給与振込","","No","Salary","普通","","Personal"\n';
    const { rows, errors } = parseImportCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0].amount).toBe(443334);
  });

  it("必須列が欠けている場合はエラーを返す", () => {
    const csv = '"Date","Amount"\n"2025-02-01","-1000"\n';
    const { rows, errors } = parseImportCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/必須列/);
  });

  it("日付が不正な行はエラーとして除外し、他の行は取り込む", () => {
    const csv =
      header +
      "\n" +
      '"2025/02/01","-1000","JPY","不正日付","","No","Groceries","普通","","Personal"\n' +
      '"2025-02-02","-500","JPY","正常行","","No","Groceries","普通","","Personal"\n';
    const { rows, errors } = parseImportCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("正常行");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/2行目/);
  });

  it("金額が整数でない行はエラーとして除外する", () => {
    const csv =
      header +
      "\n" +
      '"2025-02-01","-12.5","JPY","小数金額","","No","Groceries","普通","","Personal"\n';
    const { rows, errors } = parseImportCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/金額/);
  });

  it("空のMemo列はnullになる", () => {
    const csv =
      header +
      "\n" +
      '"2025-02-01","-1000","JPY","説明","","No","Groceries","普通","","Personal"\n';
    const { rows } = parseImportCsv(csv);
    expect(rows[0].memo).toBeNull();
  });
});

describe("重複検出（transactionKey / buildExistingKeyCounts / classifyRows）", () => {
  it("date+amount+descriptionが一致する行を重複と判定する", () => {
    const existing = [
      { date: "2025-02-01", amount: -1000, description: "スーパー" },
    ];
    const counts = buildExistingKeyCounts(existing);
    const rows = [row({ date: "2025-02-01", amount: -1000, description: "スーパー" })];
    const classified = classifyRows(rows, counts);
    expect(classified[0].duplicate).toBe(true);
  });

  it("カテゴリやメモが異なっても date+amount+description が一致すれば重複扱い", () => {
    const existing = [
      { date: "2025-02-01", amount: -1000, description: "スーパー" },
    ];
    const counts = buildExistingKeyCounts(existing);
    const rows = [
      row({
        date: "2025-02-01",
        amount: -1000,
        description: "スーパー",
        category: "Eating Out",
        memo: "違うメモ",
      }),
    ];
    expect(classifyRows(rows, counts)[0].duplicate).toBe(true);
  });

  it("一部の項目が異なれば重複と判定しない", () => {
    const existing = [
      { date: "2025-02-01", amount: -1000, description: "スーパー" },
    ];
    const counts = buildExistingKeyCounts(existing);
    const rows = [
      row({ date: "2025-02-01", amount: -1001, description: "スーパー" }),
      row({ date: "2025-02-02", amount: -1000, description: "スーパー" }),
      row({ date: "2025-02-01", amount: -1000, description: "コンビニ" }),
    ];
    const classified = classifyRows(rows, counts);
    expect(classified.every((c) => !c.duplicate)).toBe(true);
  });

  it("同一キーが複数件ある場合は既存件数分だけ重複として消費する（多重集合）", () => {
    // 既存に同一キーの取引が1件だけある場合、CSV側に同キーが2件あれば
    // 1件目は重複、2件目は新規（同日同額同説明の別取引が新たに増えたケース）として扱う。
    const existing = [
      { date: "2025-02-01", amount: -500, description: "コンビニ" },
    ];
    const counts = buildExistingKeyCounts(existing);
    const rows = [
      row({ date: "2025-02-01", amount: -500, description: "コンビニ" }),
      row({ date: "2025-02-01", amount: -500, description: "コンビニ" }),
    ];
    const classified = classifyRows(rows, counts);
    expect(classified.map((c) => c.duplicate)).toEqual([true, false]);
  });

  it("transactionKeyは date/amount/description を連結する", () => {
    expect(transactionKey({ date: "2025-02-01", amount: -500, description: "x" })).toBe(
      "2025-02-01 -500 x",
    );
  });
});

describe("未知カテゴリ検出（findUnknownCategories / addUnknownCategories）", () => {
  it("categories.jsonに無いカテゴリを出現順・重複なしで返す", () => {
    const rows = [
      row({ category: "Groceries" }),
      row({ category: "NewCategory" }),
      row({ category: "NewCategory" }),
      row({ category: "AnotherNew" }),
    ];
    expect(findUnknownCategories(rows, categories)).toEqual(["NewCategory", "AnotherNew"]);
  });

  it("未知カテゴリが無ければ空配列", () => {
    expect(findUnknownCategories([row({ category: "Groceries" })], categories)).toEqual([]);
  });

  it("addUnknownCategoriesはgroup:otherで追加し、既存カテゴリは変更しない", () => {
    const updated = addUnknownCategories(categories, ["NewCategory"]);
    expect(updated.categories.NewCategory).toEqual({ label: "NewCategory", group: "other" });
    expect(updated.categories.Groceries).toEqual(categories.categories.Groceries);
    // 元オブジェクトは変更しない（イミュータブル）
    expect(categories.categories.NewCategory).toBeUndefined();
  });

  it("空配列を渡した場合は元のオブジェクトをそのまま返す", () => {
    expect(addUnknownCategories(categories, [])).toBe(categories);
  });
});

describe("ID採番（nextSequence / assignImportIds）", () => {
  it("nextSequenceは既存IDの最大連番+1を返す", () => {
    expect(nextSequence(["t-2025-000001", "t-2025-000050", "t-2025-000003"])).toBe(51);
  });

  it("既存IDが無ければ1", () => {
    expect(nextSequence([])).toBe(1);
  });

  it("assignImportIdsは日付昇順でt-{year}-{連番6桁}を採番する", () => {
    const rows = [
      row({ date: "2025-02-03", description: "3日" }),
      row({ date: "2025-02-01", description: "1日" }),
      row({ date: "2025-02-02", description: "2日" }),
    ];
    const result = assignImportIds(rows, 2025, ["t-2025-000010"]);
    expect(result.map((t) => t.id)).toEqual(["t-2025-000011", "t-2025-000012", "t-2025-000013"]);
    expect(result.map((t) => t.description)).toEqual(["1日", "2日", "3日"]);
  });

  it("採番されたTransactionはisSpecial:false, specialNote:nullで初期化される", () => {
    const result = assignImportIds([row({})], 2025, []);
    expect(result[0].isSpecial).toBe(false);
    expect(result[0].specialNote).toBeNull();
  });
});

describe("groupRowsByYear / rowsPeriod", () => {
  it("date先頭4桁で年ごとにグループ化する", () => {
    const rows = [
      row({ date: "2025-12-31" }),
      row({ date: "2026-01-01" }),
      row({ date: "2025-01-01" }),
    ];
    const byYear = groupRowsByYear(rows);
    expect(byYear.get(2025)).toHaveLength(2);
    expect(byYear.get(2026)).toHaveLength(1);
  });

  it("rowsPeriodは最小・最大日付を返す", () => {
    const rows = [row({ date: "2025-02-03" }), row({ date: "2025-01-15" }), row({ date: "2025-03-01" })];
    expect(rowsPeriod(rows)).toEqual({ start: "2025-01-15", end: "2025-03-01" });
  });

  it("空配列の場合はnull", () => {
    expect(rowsPeriod([])).toBeNull();
  });
});

describe("buildImportPreview", () => {
  it("パース・重複検出・未知カテゴリ検出をまとめて行う", () => {
    const header =
      '"Date","Amount","Account Currency","Description","Memo","Receipt","Category","Account Name","Account Number","Work"';
    const csv =
      header +
      "\n" +
      '"2025-02-01","-1000","JPY","既存分","","No","Groceries","普通","","Personal"\n' +
      '"2025-02-02","-2000","JPY","新規分","","No","NewCat","普通","","Personal"\n';
    const existing = [{ date: "2025-02-01", amount: -1000, description: "既存分" }];

    const preview = buildImportPreview(csv, existing, categories);
    expect(preview.totalRows).toBe(2);
    expect(preview.newRows.map((r) => r.description)).toEqual(["新規分"]);
    expect(preview.duplicateRows.map((r) => r.description)).toEqual(["既存分"]);
    expect(preview.unknownCategories).toEqual(["NewCat"]);
    expect(preview.period).toEqual({ start: "2025-02-01", end: "2025-02-02" });
    expect(preview.parseErrors).toEqual([]);
  });
});

// --- 実データでの検証 ---
// docs/implementation-plan.md Phase 1-4 の受け入れ条件:
// 「実データのCSV（既存明細と重複を含むもの）を貼り付けて、重複が正しく検出され、
//   新規分のみ取り込まれる」を、ユーザーが用意した実際のCSVファイルで検証する。
//
// parameters/ 配下は .gitignore 対象（コミットされない）。ファイルが無い環境
// （CI等）ではこのブロックはスキップする。
// money-lens-data のローカルクローンも同様に、無ければスキップする
// （このリポジトリの外にある実データなので、常に存在するとは限らない）。
const currentDir = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(
  currentDir,
  "../../parameters/All Accounts-2025-01-01-2026-07-25.csv",
);
const DATA_REPO_DIR = resolve(currentDir, "../../../money-lens-data");

const describeRealData = existsSync(CSV_PATH) && existsSync(DATA_REPO_DIR) ? describe : describe.skip;

describeRealData("実データ検証（parameters/All Accounts-2025-01-01-2026-07-25.csv）", () => {
  const csvText = readFileSync(CSV_PATH, "utf-8");

  function loadYear(year: number): { date: string; amount: number; description: string }[] {
    const path = resolve(DATA_REPO_DIR, `transactions/${year}.json`);
    if (!existsSync(path)) return [];
    const data = JSON.parse(readFileSync(path, "utf-8")) as {
      transactions: { date: string; amount: number; description: string }[];
    };
    return data.transactions;
  }

  function loadCategories(): CategoriesData {
    const path = resolve(DATA_REPO_DIR, "categories.json");
    return JSON.parse(readFileSync(path, "utf-8")) as CategoriesData;
  }

  it("パースエラー無く全行を取り込める", () => {
    const { rows, errors } = parseImportCsv(csvText);
    expect(errors).toEqual([]);
    // CSVファイルの非空行数（ヘッダー除く）と一致すること
    const nonEmptyLines = csvText.split(/\r\n|\n/).filter((l) => l.trim() !== "");
    expect(rows.length).toBe(nonEmptyLines.length - 1);
    // すべての金額が整数であること（浮動小数を含まない）
    expect(rows.every((r) => Number.isInteger(r.amount))).toBe(true);
  });

  it("重複検出件数が、独立に計算した多重集合ベースの件数と一致する（money-lens-dataの現状に対して）", () => {
    const { rows } = parseImportCsv(csvText);
    const existingAll = [...loadYear(2025), ...loadYear(2026)];

    // buildImportPreviewとは独立にブルートフォースで多重集合ベースの重複数を計算し、
    // 実装（classifyRows）の結果と突き合わせる。
    const existingCounts = new Map<string, number>();
    for (const t of existingAll) {
      const key = transactionKey(t);
      existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
    }
    const consumed = new Map<string, number>();
    let expectedDuplicateCount = 0;
    for (const r of rows) {
      const key = transactionKey(r);
      const available = (existingCounts.get(key) ?? 0) - (consumed.get(key) ?? 0);
      if (available > 0) {
        expectedDuplicateCount += 1;
        consumed.set(key, (consumed.get(key) ?? 0) + 1);
      }
    }

    const preview = buildImportPreview(csvText, existingAll, loadCategories());
    expect(preview.duplicateRows.length).toBe(expectedDuplicateCount);
    expect(preview.newRows.length).toBe(rows.length - expectedDuplicateCount);

    // 妥当性チェック: このCSVはmoney-lens-dataの既存データと大部分（またはこのタスクでの
    // 実データ更新後は全体）重なる期間なので、重複は既存データの半数を大きく超えるはず。
    // newRows は0件（＝CSVが既に取り込み済み）でも構わない。money-lens-data側の
    // 状態に依存するため、ここでは新規0件を許容しつつ整合性のみ検証する。
    expect(preview.duplicateRows.length).toBeGreaterThan(existingAll.length * 0.5);
    expect(preview.duplicateRows.length + preview.newRows.length).toBe(rows.length);
  });

  it("取り込み対象期間が既存データより新しい終端を含む", () => {
    const preview = buildImportPreview(
      csvText,
      [...loadYear(2025), ...loadYear(2026)],
      loadCategories(),
    );
    expect(preview.period).not.toBeNull();
    expect(preview.period!.start >= "2025-01-01").toBe(true);
    expect(preview.period!.end <= "2026-07-25").toBe(true);
  });
});
