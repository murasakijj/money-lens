import { describe, it, expect } from "vitest";
import { buildAnalyzeSummary } from "./summarize";
import type {
  BudgetsData,
  CategoriesData,
  MonthMeta,
  Transaction,
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
  },
};

const budgets: BudgetsData = {
  monthlyBudgets: { food: 90000, fixed: 120000 },
  savingsTarget: 50000,
};

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t-1",
    date: "2026-06-01",
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

describe("buildAnalyzeSummary", () => {
  it("対象月のbyGroup・前月のprevMonth・budgets・incomeを組み立てる", () => {
    const transactions: Transaction[] = [
      tx({ id: "a", date: "2026-06-05", amount: -85200, category: "Groceries" }),
      tx({ id: "b", date: "2026-06-05", amount: -18400, category: "Rent" }),
      tx({ id: "c", date: "2026-06-25", amount: 580000, category: "Salary" }),
      tx({ id: "d", date: "2026-05-05", amount: -71000, category: "Groceries" }),
    ];

    const summary = buildAnalyzeSummary({
      transactions,
      categories,
      budgets,
      monthsMeta: [],
      targetMonth: "2026-06",
    });

    expect(summary.byGroup).toEqual({ food: -85200, fixed: -18400, income: 580000 });
    expect(summary.prevMonth).toEqual({ food: -71000 });
    expect(summary.budgets).toEqual({ food: 90000, fixed: 120000 });
    expect(summary.income).toBe(580000);
  });

  it("年をまたいだ前月比も正しく計算する", () => {
    const transactions: Transaction[] = [
      tx({ id: "a", date: "2026-01-05", amount: -1000, category: "Groceries" }),
      tx({ id: "b", date: "2025-12-05", amount: -500, category: "Groceries" }),
    ];

    const summary = buildAnalyzeSummary({
      transactions,
      categories,
      budgets,
      monthsMeta: [],
      targetMonth: "2026-01",
    });

    expect(summary.byGroup).toEqual({ food: -1000 });
    expect(summary.prevMonth).toEqual({ food: -500 });
  });

  it("月メモがisSpecialな場合、そのnoteをspecialNotesに含める", () => {
    const monthsMeta: MonthMeta[] = [
      {
        month: "2026-06",
        isSpecial: true,
        note: "定期券購入(5万円)",
        balanceStart: 0,
        balanceEnd: 0,
      },
    ];

    const summary = buildAnalyzeSummary({
      transactions: [],
      categories,
      budgets,
      monthsMeta,
      targetMonth: "2026-06",
    });

    expect(summary.specialNotes).toEqual(["定期券購入(5万円)"]);
  });

  it("isSpecialな取引のspecialNoteを重複なく含める", () => {
    const transactions: Transaction[] = [
      tx({
        id: "a",
        date: "2026-06-05",
        isSpecial: true,
        specialNote: "旅行費用",
      }),
      tx({
        id: "b",
        date: "2026-06-10",
        isSpecial: true,
        specialNote: "旅行費用",
      }),
      tx({
        id: "c",
        date: "2026-06-15",
        isSpecial: false,
        specialNote: null,
      }),
      // 対象月外は含めない
      tx({
        id: "d",
        date: "2026-05-15",
        isSpecial: true,
        specialNote: "対象月外の特別出費",
      }),
    ];

    const summary = buildAnalyzeSummary({
      transactions,
      categories,
      budgets,
      monthsMeta: [],
      targetMonth: "2026-06",
    });

    expect(summary.specialNotes).toEqual(["旅行費用"]);
  });

  it("recentMonthsTrendは既定で直近6ヶ月分をmonth/expense/incomeで返す", () => {
    const transactions: Transaction[] = [
      tx({ id: "a", date: "2026-06-05", amount: -1000, category: "Groceries" }),
      tx({ id: "b", date: "2026-06-25", amount: 580000, category: "Salary" }),
    ];

    const summary = buildAnalyzeSummary({
      transactions,
      categories,
      budgets,
      monthsMeta: [],
      targetMonth: "2026-06",
    });

    expect(summary.recentMonthsTrend).toHaveLength(6);
    expect(summary.recentMonthsTrend[5]).toEqual({
      month: "2026-06",
      expense: -1000,
      income: 580000,
    });
    expect(summary.recentMonthsTrend[0].month).toBe("2026-01");
  });

  it("trendMonthsオプションで件数を変更できる", () => {
    const summary = buildAnalyzeSummary({
      transactions: [],
      categories,
      budgets,
      monthsMeta: [],
      targetMonth: "2026-06",
      trendMonths: 3,
    });

    expect(summary.recentMonthsTrend).toHaveLength(3);
    expect(summary.recentMonthsTrend.map((t) => t.month)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });
});
