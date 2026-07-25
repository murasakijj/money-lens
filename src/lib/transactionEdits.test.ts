import { describe, it, expect } from "vitest";
import type { CategoriesData, Transaction } from "./aggregate";
import {
  addTransaction,
  createManualId,
  distinctAccounts,
  emptyEditSession,
  filterTransactions,
  groupedCategoryOptions,
  hasPendingChanges,
  removeTransaction,
  resolveTransactions,
  summarizeEditSession,
  upsertUpdate,
  type EditSessionState,
} from "./transactionEdits";

const categories: CategoriesData = {
  groups: [
    { id: "food", label: "食費", color: "#e07a5f" },
    { id: "fixed", label: "固定費", color: "#5f797b" },
    { id: "other", label: "その他", color: "#adb5bd" },
    { id: "income", label: "収入", color: "#2a9d8f" },
    { id: "excluded", label: "振替（集計除外）", color: "#ced4da" },
  ],
  categories: {
    Groceries: { label: "食料品", group: "food" },
    "Eating Out": { label: "外食", group: "food" },
    Rent: { label: "家賃", group: "fixed" },
    Salary: { label: "給与", group: "income" },
    "Card Payment": { label: "カード返済", group: "excluded" },
  },
};

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t-2025-000001",
    date: "2025-02-01",
    amount: -1000,
    currency: "JPY",
    description: "test",
    memo: null,
    category: "Groceries",
    account: "普通",
    work: "Personal",
    isSpecial: false,
    specialNote: null,
    ...overrides,
  };
}

describe("filterTransactions", () => {
  const txs: Transaction[] = [
    tx({ id: "a", date: "2025-01-31", category: "Groceries", account: "普通" }),
    tx({
      id: "b",
      date: "2025-02-01",
      category: "Rent",
      account: "エポスゴールドカード",
      description: "家賃引き落とし",
    }),
    tx({
      id: "c",
      date: "2025-02-15",
      category: "Groceries",
      account: "普通",
      description: "スーパーで買い物",
      memo: "肉と野菜",
    }),
    tx({ id: "d", date: "2025-02-20", category: "Card Payment", account: "普通" }),
    tx({ id: "e", date: "2025-03-01", category: "Groceries", account: "普通" }),
  ];

  it("月で絞り込む", () => {
    const result = filterTransactions(txs, categories, {
      month: "2025-02",
      groupId: "all",
      account: "all",
      keyword: "",
    });
    expect(result.map((t) => t.id).sort()).toEqual(["b", "c", "d"]);
  });

  it("カテゴリグループで絞り込む", () => {
    const result = filterTransactions(txs, categories, {
      month: "2025-02",
      groupId: "food",
      account: "all",
      keyword: "",
    });
    expect(result.map((t) => t.id)).toEqual(["c"]);
  });

  it("口座で絞り込む", () => {
    const result = filterTransactions(txs, categories, {
      month: "2025-02",
      groupId: "all",
      account: "エポスゴールドカード",
      keyword: "",
    });
    expect(result.map((t) => t.id)).toEqual(["b"]);
  });

  it("キーワードは説明文・メモ・カテゴリラベルを対象にする（大文字小文字を無視）", () => {
    const byDescription = filterTransactions(txs, categories, {
      month: "2025-02",
      groupId: "all",
      account: "all",
      keyword: "家賃",
    });
    expect(byDescription.map((t) => t.id)).toEqual(["b"]);

    const byMemo = filterTransactions(txs, categories, {
      month: "2025-02",
      groupId: "all",
      account: "all",
      keyword: "野菜",
    });
    expect(byMemo.map((t) => t.id)).toEqual(["c"]);

    const byCategoryLabel = filterTransactions(txs, categories, {
      month: "2025-02",
      groupId: "all",
      account: "all",
      keyword: "食料品",
    });
    expect(byCategoryLabel.map((t) => t.id)).toEqual(["c"]);
  });

  it("日付降順（新しい順）で返す", () => {
    const result = filterTransactions(txs, categories, {
      month: "2025-02",
      groupId: "all",
      account: "all",
      keyword: "",
    });
    expect(result.map((t) => t.date)).toEqual(["2025-02-20", "2025-02-15", "2025-02-01"]);
  });
});

describe("編集セッション（upsertUpdate / removeTransaction / addTransaction）", () => {
  it("既存取引への更新はupdatesに積まれ、マージされる", () => {
    let session = emptyEditSession();
    session = upsertUpdate(session, "a", { category: "Rent" });
    session = upsertUpdate(session, "a", { isSpecial: true, specialNote: "旅行" });

    expect(session.updates.a).toEqual({
      category: "Rent",
      isSpecial: true,
      specialNote: "旅行",
    });
    expect(hasPendingChanges(session)).toBe(true);
  });

  it("既存取引の削除はdeletedIdsに積み、保留中のupdateは破棄する", () => {
    let session = emptyEditSession();
    session = upsertUpdate(session, "a", { category: "Rent" });
    session = removeTransaction(session, "a");

    expect(session.deletedIds.has("a")).toBe(true);
    expect(session.updates.a).toBeUndefined();
  });

  it("手動追加分の削除はセッションから完全に取り除く（deletedIdsには積まない）", () => {
    let session = emptyEditSession();
    const newTx = tx({ id: "new-1" });
    session = addTransaction(session, newTx);
    session = removeTransaction(session, "new-1");

    expect(session.added).toEqual([]);
    expect(session.deletedIds.has("new-1")).toBe(false);
    expect(hasPendingChanges(session)).toBe(false);
  });

  it("手動追加分への更新はadded配列内を書き換える", () => {
    let session = emptyEditSession();
    session = addTransaction(session, tx({ id: "new-1", category: "Groceries" }));
    session = upsertUpdate(session, "new-1", { category: "Rent" });

    expect(session.added[0].category).toBe("Rent");
    expect(session.updates["new-1"]).toBeUndefined();
  });

  it("変更がなければhasPendingChangesはfalse", () => {
    expect(hasPendingChanges(emptyEditSession())).toBe(false);
  });
});

describe("resolveTransactions", () => {
  const base: Transaction[] = [
    tx({ id: "a", date: "2025-02-01" }),
    tx({ id: "b", date: "2025-02-10" }),
  ];

  it("更新・削除・追加を反映し、日付昇順で返す", () => {
    let session = emptyEditSession();
    session = upsertUpdate(session, "a", { isSpecial: true, specialNote: "特別" });
    session = removeTransaction(session, "b");
    session = addTransaction(session, tx({ id: "c", date: "2025-02-05" }));

    const result = resolveTransactions(base, session);
    expect(result.map((t) => t.id)).toEqual(["a", "c"]);
    expect(result[0].isSpecial).toBe(true);
    expect(result[0].specialNote).toBe("特別");
  });

  it("変更がなければ元の配列と同じ内容（日付昇順）を返す", () => {
    const result = resolveTransactions(base, emptyEditSession());
    expect(result.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("summarizeEditSession", () => {
  it("追加・更新・削除の件数を日本語でまとめる", () => {
    let session: EditSessionState = emptyEditSession();
    session = addTransaction(session, tx({ id: "new-1" }));
    session = upsertUpdate(session, "a", { category: "Rent" });
    session = removeTransaction(session, "b");

    expect(summarizeEditSession(session)).toBe("追加1件・更新1件・削除1件");
  });

  it("変更なしの場合", () => {
    expect(summarizeEditSession(emptyEditSession())).toBe("変更なし");
  });
});

describe("createManualId", () => {
  it("t-{year}-{timestamp} 形式のIDを返す", () => {
    const id = createManualId(2025, []);
    expect(id).toMatch(/^t-2025-\d+$/);
  });

  it("同じIDが既存の場合は衝突しなくなるまでインクリメントする", () => {
    const now = Date.now();
    const existing = [`t-2025-${now}`, `t-2025-${now + 1}`];
    const id = createManualId(2025, existing);
    expect(existing).not.toContain(id);
    expect(id).toMatch(/^t-2025-\d+$/);
  });
});

describe("groupedCategoryOptions", () => {
  it("グループごとにまとめ、空のグループは含めない", () => {
    const result = groupedCategoryOptions(categories);
    const groupIds = result.map((g) => g.group.id);
    expect(groupIds).toEqual(["food", "fixed", "income", "excluded"]);
    expect(groupIds).not.toContain("other");
  });

  it("グループ内はラベル順にソートされる", () => {
    const result = groupedCategoryOptions(categories);
    const food = result.find((g) => g.group.id === "food");
    expect(food?.options.map((o) => o.label)).toEqual(["外食", "食料品"]);
  });
});

describe("distinctAccounts", () => {
  it("既知の口座と実データ中の口座名を重複なく統合する", () => {
    const txs = [tx({ account: "普通" }), tx({ account: "新しい口座" })];
    const result = distinctAccounts(txs, ["普通", "エポスゴールドカード"]);
    expect(result).toEqual(["エポスゴールドカード", "新しい口座", "普通"]);
  });
});
