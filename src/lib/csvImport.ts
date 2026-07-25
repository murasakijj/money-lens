/**
 * /import（CSVインポート）のロジック（純関数のみ）。
 *
 * ファイル選択・貼り付けのどちらでも同じ文字列入力から扱えるように、
 * 「CSV文字列 → 行データ」の変換をこのファイルに閉じる。
 * 重複検出・未知カテゴリ検出・ID採番もここに純関数として実装し、
 * Vitestで検証する。GitHub経由のデータ読み込み・保存はこのファイルでは行わない。
 *
 * 対応CSV形式: docs/data-model.md の settings.json importProfiles（カード家計簿アプリCSV）。
 * `#` 列は実際のエクスポートには含まれないことがあるため、ヘッダー名でマッチングし、
 * `#` 列の有無どちらでも動くようにする（列の並び順にも依存しない）。
 */

import type { CategoriesData, Transaction } from "./aggregate";

/** ヘッダー名でマッチングする必須列（"#" と "Account Number" は任意）。 */
const REQUIRED_COLUMNS = [
  "Date",
  "Amount",
  "Account Currency",
  "Description",
  "Category",
  "Account Name",
  "Work",
] as const;

/** インポートCSVの1行（IDは未採番。年ごとの保存直前に割り当てる）。 */
export interface ParsedRow {
  date: string; // ISO 8601 (YYYY-MM-DD)
  amount: number; // 整数（円）。収入 >= 0、支出 < 0
  currency: string;
  description: string;
  memo: string | null;
  category: string;
  account: string;
  work: string;
}

export interface CsvParseResult {
  rows: ParsedRow[];
  /** 行番号（1始まり、ヘッダーを除く）付きのエラーメッセージ。エラー行はrowsに含めない。 */
  errors: string[];
}

/**
 * RFC4180相当のCSVパース（ダブルクォート囲み・カンマ/改行を含むフィールド・""エスケープに対応）。
 * 改行は \r\n / \n どちらも許容する。
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let i = 0;
  const len = normalized.length;
  while (i < len) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // 末尾行（改行なしで終わる場合）を回収する。空文字のみの最終行は無視。
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * CSV文字列（ファイル選択/貼り付けどちらも同じ文字列）を ParsedRow[] に変換する。
 * ヘッダー名でマッチングするため、`#` 列の有無・列順に依存しない。
 */
export function parseImportCsv(text: string): CsvParseResult {
  const table = parseCsvText(text);
  if (table.length === 0) {
    return { rows: [], errors: ["データがありません。"] };
  }

  const header = table[0].map((h) => h.trim());
  const colIndex = new Map<string, number>();
  header.forEach((name, idx) => {
    if (!colIndex.has(name)) colIndex.set(name, idx);
  });

  const missing = REQUIRED_COLUMNS.filter((c) => !colIndex.has(c));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`必須列が見つかりません: ${missing.join(", ")}`],
    };
  }

  const idx = (name: string): number => colIndex.get(name)!;
  const memoIdx = colIndex.get("Memo");

  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  for (let r = 1; r < table.length; r++) {
    const cols = table[r];
    const lineNo = r + 1; // ヘッダーを含めた実ファイル上の行番号（1始まり）
    if (cols.length === 1 && cols[0].trim() === "") continue; // 空行はスキップ

    const dateRaw = (cols[idx("Date")] ?? "").trim();
    const amountRaw = (cols[idx("Amount")] ?? "").trim();
    const description = (cols[idx("Description")] ?? "").trim();
    const category = (cols[idx("Category")] ?? "").trim();
    const account = (cols[idx("Account Name")] ?? "").trim();
    const work = (cols[idx("Work")] ?? "").trim();
    const currency = (cols[idx("Account Currency")] ?? "JPY").trim() || "JPY";
    const memoRaw = memoIdx !== undefined ? (cols[memoIdx] ?? "").trim() : "";

    if (!DATE_RE.test(dateRaw)) {
      errors.push(`${lineNo}行目: 日付の形式が不正です（"${dateRaw}"）。`);
      continue;
    }
    if (!/^-?\d+$/.test(amountRaw)) {
      errors.push(`${lineNo}行目: 金額が整数ではありません（"${amountRaw}"）。`);
      continue;
    }
    if (!description) {
      errors.push(`${lineNo}行目: 説明が空です。`);
      continue;
    }
    if (!category) {
      errors.push(`${lineNo}行目: カテゴリが空です。`);
      continue;
    }
    if (!account) {
      errors.push(`${lineNo}行目: 口座名が空です。`);
      continue;
    }

    rows.push({
      date: dateRaw,
      amount: Number(amountRaw),
      currency,
      description,
      memo: memoRaw || null,
      category,
      account,
      work: work || "Personal",
    });
  }

  return { rows, errors };
}

/** 重複検出キー: date + amount + description が完全一致する行を「重複の可能性」とする。 */
export function transactionKey(t: {
  date: string;
  amount: number;
  description: string;
}): string {
  return `${t.date} ${t.amount} ${t.description}`;
}

/** 既存取引からキーごとの出現回数を数える（同一内容の取引が複数回起きるケースに対応するため）。 */
export function buildExistingKeyCounts(
  existingTransactions: Iterable<{ date: string; amount: number; description: string }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of existingTransactions) {
    const key = transactionKey(t);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export interface ClassifiedRow {
  row: ParsedRow;
  /** 既存データに同一キー（date+amount+description）が存在する行。 */
  duplicate: boolean;
}

/**
 * 既存取引と突き合わせて重複行を判定する（元のCSVの並び順を維持）。
 * 同一キーが既存側にn件あれば、CSV側の先頭からn件だけを重複として消費する
 * （同じ日に同額・同説明の取引が複数回起きても、既存件数を超えた分は新規として扱う）。
 */
export function classifyRows(
  rows: ParsedRow[],
  existingKeyCounts: Map<string, number>,
): ClassifiedRow[] {
  const remaining = new Map(existingKeyCounts);
  return rows.map((row) => {
    const key = transactionKey(row);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      return { row, duplicate: true };
    }
    return { row, duplicate: false };
  });
}

/** categories.json に存在しないカテゴリキー一覧（出現順を保ちつつ重複なし）。 */
export function findUnknownCategories(
  rows: ParsedRow[],
  categories: CategoriesData,
): string[] {
  const known = new Set(Object.keys(categories.categories));
  const found: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (known.has(row.category) || seen.has(row.category)) continue;
    seen.add(row.category);
    found.push(row.category);
  }
  return found;
}

/** 未知カテゴリを group: "other" として categories.json に自動追加する（既存カテゴリは変更しない）。 */
export function addUnknownCategories(
  categories: CategoriesData,
  unknownKeys: string[],
): CategoriesData {
  if (unknownKeys.length === 0) return categories;
  const nextCategories = { ...categories.categories };
  for (const key of unknownKeys) {
    if (!nextCategories[key]) {
      nextCategories[key] = { label: key, group: "other" };
    }
  }
  return { ...categories, categories: nextCategories };
}

/** 取り込み対象行を年（date先頭4桁）ごとにまとめる。 */
export function groupRowsByYear(rows: ParsedRow[]): Map<number, ParsedRow[]> {
  const byYear = new Map<number, ParsedRow[]>();
  for (const row of rows) {
    const year = Number(row.date.slice(0, 4));
    const list = byYear.get(year) ?? [];
    list.push(row);
    byYear.set(year, list);
  }
  return byYear;
}

/** 既存ID（t-{year}-{連番6桁}）群から次の連番を求める。既存が無ければ1。 */
export function nextSequence(existingIds: Iterable<string>): number {
  let max = 0;
  for (const id of existingIds) {
    const m = /^t-\d{4}-(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function toTransaction(row: ParsedRow, id: string): Transaction {
  return {
    id,
    date: row.date,
    amount: row.amount,
    currency: row.currency,
    description: row.description,
    memo: row.memo,
    category: row.category,
    account: row.account,
    work: row.work,
    isSpecial: false,
    specialNote: null,
  };
}

/**
 * 指定した年の新規行に `t-{year}-{連番6桁}` のIDを採番する（data-migration.md の規則）。
 * 日付昇順で採番し、既存IDの最大連番の次から続ける。
 */
export function assignImportIds(
  rows: ParsedRow[],
  year: number,
  existingIds: Iterable<string>,
): Transaction[] {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let seq = nextSequence(existingIds);
  return sorted.map((row) => {
    const id = `t-${year}-${String(seq).padStart(6, "0")}`;
    seq += 1;
    return toTransaction(row, id);
  });
}

export interface ImportPeriod {
  start: string;
  end: string;
}

/** 行群の日付範囲（YYYY-MM-DD, 昇順）。空なら null。 */
export function rowsPeriod(rows: ParsedRow[]): ImportPeriod | null {
  if (rows.length === 0) return null;
  let start = rows[0].date;
  let end = rows[0].date;
  for (const row of rows) {
    if (row.date < start) start = row.date;
    if (row.date > end) end = row.date;
  }
  return { start, end };
}

export interface ImportPreview {
  totalRows: number;
  newRows: ParsedRow[];
  duplicateRows: ParsedRow[];
  unknownCategories: string[];
  period: ImportPeriod | null;
  parseErrors: string[];
}

/**
 * プレビュー生成: パース→重複検出→未知カテゴリ検出をまとめる。
 * existingTransactions は取り込み対象期間に関係する年の既存取引をすべて渡すこと
 * （年をまたぐCSVの場合、複数年分をまとめて渡してよい。キーに年月日を含むため衝突しない）。
 */
export function buildImportPreview(
  csvText: string,
  existingTransactions: Iterable<{ date: string; amount: number; description: string }>,
  categories: CategoriesData,
): ImportPreview {
  const { rows, errors } = parseImportCsv(csvText);
  const existingKeyCounts = buildExistingKeyCounts(existingTransactions);
  const classified = classifyRows(rows, existingKeyCounts);
  const newRows = classified.filter((c) => !c.duplicate).map((c) => c.row);
  const duplicateRows = classified.filter((c) => c.duplicate).map((c) => c.row);

  return {
    totalRows: rows.length,
    newRows,
    duplicateRows,
    unknownCategories: findUnknownCategories(rows, categories),
    period: rowsPeriod(rows),
    parseErrors: errors,
  };
}
