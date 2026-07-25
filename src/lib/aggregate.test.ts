import { describe, it, expect } from "vitest";
import {
  aggregateForMonth,
  aggregateMonth,
  budgetUsage,
  currentMonth,
  expenseByGroup,
  getMonthMeta,
  groupIdForCategory,
  monthOverMonthDiff,
  monthlyTrend,
  savingsGap,
  shiftMonth,
  trailingMonths,
  transactionsInMonth,
  type BudgetsData,
  type CategoriesData,
  type MonthMeta,
  type Transaction,
} from "./aggregate";

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
    Transfer: { label: "口座振替", group: "excluded" },
  },
};

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t-1",
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

describe("groupIdForCategory", () => {
  it("既知カテゴリはcategories.jsonのグループを返す", () => {
    expect(groupIdForCategory("Groceries", categories)).toBe("food");
  });

  it("未知カテゴリは other 扱いにする", () => {
    expect(groupIdForCategory("Some New Category", categories)).toBe("other");
  });
});

describe("transactionsInMonth / 日付境界", () => {
  const txs: Transaction[] = [
    tx({ id: "a", date: "2025-01-31" }),
    tx({ id: "b", date: "2025-02-01" }),
    tx({ id: "c", date: "2025-02-28" }),
    tx({ id: "d", date: "2025-03-01" }),
    tx({ id: "e", date: "2025-12-31" }),
    tx({ id: "f", date: "2026-01-01" }),
  ];

  it("月初・月末の境界を正しく切り出す", () => {
    const feb = transactionsInMonth(txs, "2025-02");
    expect(feb.map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("年をまたぐ月も正しく切り出す", () => {
    expect(transactionsInMonth(txs, "2025-12").map((t) => t.id)).toEqual(["e"]);
    expect(transactionsInMonth(txs, "2026-01").map((t) => t.id)).toEqual(["f"]);
  });
});

describe("aggregateMonth", () => {
  it("収入(amount>=0)と支出(amount<0)を符号通りに集計する", () => {
    const result = aggregateMonth(
      [tx({ amount: -1000, category: "Groceries" }), tx({ amount: 300000, category: "Salary" })],
      categories,
    );
    expect(result.income).toBe(300000);
    expect(result.expense).toBe(-1000);
    expect(result.net).toBe(299000);
  });

  it("amount=0 は収入側(>=0)として扱う", () => {
    const result = aggregateMonth([tx({ amount: 0, category: "Groceries" })], categories);
    expect(result.income).toBe(0);
    expect(result.expense).toBe(0);
    expect(result.byGroup.food).toBe(0);
  });

  it("excludedグループ(Card Payment/Transfer)は集計から除外する", () => {
    const result = aggregateMonth(
      [
        tx({ amount: -50000, category: "Card Payment" }),
        tx({ amount: -3000, category: "Transfer" }),
        tx({ amount: -1000, category: "Groceries" }),
      ],
      categories,
    );
    expect(result.expense).toBe(-1000);
    expect(result.byGroup.excluded).toBeUndefined();
    expect(result.transactionCount).toBe(1);
  });

  it("未知カテゴリは other グループに集計される", () => {
    const result = aggregateMonth(
      [tx({ amount: -500, category: "Mystery Category" })],
      categories,
    );
    expect(result.byGroup.other).toBe(-500);
  });

  it("excludeSpecial=falseなら特別出費を含める", () => {
    const result = aggregateMonth(
      [tx({ amount: -730000, category: "Groceries", isSpecial: true })],
      categories,
      { excludeSpecial: false },
    );
    expect(result.expense).toBe(-730000);
  });

  it("excludeSpecial=trueなら特別出費を除外する", () => {
    const result = aggregateMonth(
      [
        tx({ amount: -730000, category: "Groceries", isSpecial: true }),
        tx({ amount: -1000, category: "Groceries", isSpecial: false }),
      ],
      categories,
      { excludeSpecial: true },
    );
    expect(result.expense).toBe(-1000);
    expect(result.transactionCount).toBe(1);
  });

  it("空配列は0値を返す（浮動小数を含まない整数）", () => {
    const result = aggregateMonth([], categories);
    expect(result).toEqual({ income: 0, expense: 0, net: 0, byGroup: {}, transactionCount: 0 });
    expect(Number.isInteger(result.income)).toBe(true);
    expect(Number.isInteger(result.expense)).toBe(true);
    expect(Number.isInteger(result.net)).toBe(true);
  });
});

describe("aggregateForMonth", () => {
  it("指定月の取引だけを抽出して集計する", () => {
    const txs = [
      tx({ id: "a", date: "2025-01-15", amount: -1000 }),
      tx({ id: "b", date: "2025-02-15", amount: -2000 }),
    ];
    const result = aggregateForMonth(txs, categories, "2025-02");
    expect(result.expense).toBe(-2000);
  });
});

describe("expenseByGroup", () => {
  it("収入グループを除き、支出のみ正の値で返す", () => {
    const agg = aggregateMonth(
      [
        tx({ amount: -1000, category: "Groceries" }),
        tx({ amount: -220000, category: "Rent" }),
        tx({ amount: 300000, category: "Salary" }),
      ],
      categories,
    );
    const result = expenseByGroup(agg, categories);
    expect(result.find((g) => g.groupId === "income")).toBeUndefined();
    const food = result.find((g) => g.groupId === "food");
    expect(food?.amount).toBe(1000);
    expect(food?.color).toBe("#e07a5f");
    // 降順ソート
    expect(result[0].groupId).toBe("fixed");
  });

  it("ネットで支出がないグループ(払い戻し超過等)は含めない", () => {
    const agg = aggregateMonth([tx({ amount: 500, category: "Groceries" })], categories);
    expect(expenseByGroup(agg, categories)).toEqual([]);
  });
});

describe("budgetUsage / 予算との差額", () => {
  const budgets: BudgetsData = {
    monthlyBudgets: { food: 90000, fixed: 220000 },
    savingsTarget: 100000,
  };

  it("予算に対する消化額・残額・超過フラグを返す", () => {
    const agg = aggregateMonth(
      [tx({ amount: -95000, category: "Groceries" }), tx({ amount: -220000, category: "Rent" })],
      categories,
    );
    const usage = budgetUsage(agg, budgets, categories);
    const food = usage.find((u) => u.groupId === "food")!;
    expect(food.spent).toBe(95000);
    expect(food.remaining).toBe(-5000);
    expect(food.over).toBe(true);

    const fixed = usage.find((u) => u.groupId === "fixed")!;
    expect(fixed.spent).toBe(220000);
    expect(fixed.remaining).toBe(0);
    expect(fixed.over).toBe(false);
  });

  it("支出が0円の月でも整数のまま返す", () => {
    const agg = aggregateMonth([], categories);
    const usage = budgetUsage(agg, budgets, categories);
    expect(usage.find((u) => u.groupId === "food")).toEqual({
      groupId: "food",
      label: "食費",
      color: "#e07a5f",
      budget: 90000,
      spent: 0,
      remaining: 90000,
      over: false,
    });
  });

  it("savingsGap は net - savingsTarget", () => {
    const agg = aggregateMonth(
      [tx({ amount: 300000, category: "Salary" }), tx({ amount: -150000, category: "Rent" })],
      categories,
    );
    expect(savingsGap(agg, budgets)).toBe(300000 - 150000 - 100000);
  });
});

describe("monthOverMonthDiff / 前月比", () => {
  it("当月と前月の差分を計算する", () => {
    const current = aggregateMonth(
      [tx({ amount: -2000, category: "Groceries" })],
      categories,
    );
    const previous = aggregateMonth(
      [tx({ amount: -1000, category: "Groceries" })],
      categories,
    );
    expect(monthOverMonthDiff(current, previous)).toEqual({
      incomeDiff: 0,
      expenseDiff: -1000,
      netDiff: -1000,
    });
  });

  it("前月データがない場合はaggregateMonth([])の0値と比較できる", () => {
    const current = aggregateMonth([tx({ amount: -1000 })], categories);
    const previous = aggregateMonth([], categories);
    expect(monthOverMonthDiff(current, previous).expenseDiff).toBe(-1000);
  });
});

describe("shiftMonth / trailingMonths", () => {
  it("月内のシフトは年をまたがない", () => {
    expect(shiftMonth("2025-06", 1)).toBe("2025-07");
    expect(shiftMonth("2025-06", -1)).toBe("2025-05");
  });

  it("年をまたぐシフトを正しく処理する", () => {
    expect(shiftMonth("2025-01", -1)).toBe("2024-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("直近12ヶ月を古い順で返し、年またぎを含む", () => {
    const months = trailingMonths("2026-02", 12);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-03");
    expect(months[months.length - 1]).toBe("2026-02");
  });
});

describe("monthlyTrend", () => {
  const monthsMeta: MonthMeta[] = [
    {
      month: "2025-05",
      isSpecial: true,
      note: "指輪(73万円)",
      balanceStart: 100,
      balanceEnd: 90,
    },
  ];

  it("直近12ヶ月分のトレンドを返し、特別出費月にマークする", () => {
    const txs = [
      tx({ id: "a", date: "2025-05-10", amount: -730000, isSpecial: true }),
      tx({ id: "b", date: "2025-05-11", amount: -1000, isSpecial: false }),
    ];
    const trend = monthlyTrend(txs, categories, monthsMeta, "2025-05", { count: 12 });
    expect(trend).toHaveLength(12);
    const may = trend.find((p) => p.month === "2025-05")!;
    expect(may.isSpecial).toBe(true);
    expect(may.note).toBe("指輪(73万円)");
    expect(may.expense).toBe(-731000);
  });

  it("excludeSpecialで特別出費を除いたトレンドを取得できる", () => {
    const txs = [
      tx({ id: "a", date: "2025-05-10", amount: -730000, isSpecial: true }),
      tx({ id: "b", date: "2025-05-11", amount: -1000, isSpecial: false }),
    ];
    const trend = monthlyTrend(txs, categories, monthsMeta, "2025-05", {
      count: 1,
      excludeSpecial: true,
    });
    expect(trend[0].expense).toBe(-1000);
  });

  it("該当データがない月は0値で埋める", () => {
    const trend = monthlyTrend([], categories, [], "2025-05", { count: 3 });
    expect(trend.every((p) => p.income === 0 && p.expense === 0 && p.net === 0)).toBe(true);
    expect(trend.every((p) => p.isSpecial === false)).toBe(true);
  });
});

describe("getMonthMeta", () => {
  it("該当月のメタ情報を返す", () => {
    const meta: MonthMeta[] = [
      { month: "2025-05", isSpecial: true, note: "x", balanceStart: 1, balanceEnd: 2 },
    ];
    expect(getMonthMeta(meta, "2025-05")?.note).toBe("x");
    expect(getMonthMeta(meta, "2025-06")).toBeUndefined();
  });
});

describe("currentMonth", () => {
  it("Dateから YYYY-MM を作る", () => {
    expect(currentMonth(new Date(2025, 6, 25))).toBe("2025-07");
  });

  it("1桁月は0埋めする", () => {
    expect(currentMonth(new Date(2025, 0, 1))).toBe("2025-01");
  });
});
