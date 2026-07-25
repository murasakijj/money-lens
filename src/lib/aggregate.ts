/**
 * 月次集計ロジック（純関数のみ）。
 *
 * 金額計算はすべて整数（円）で行う。浮動小数は一切使わない。
 * データの読み込み（GitHub経由）は行わない。呼び出し側が
 * categories.json / budgets.json / months.json / transactions/{year}.json
 * の内容を渡すこと。
 */

export interface Transaction {
  id: string;
  date: string; // ISO 8601 (YYYY-MM-DD)
  amount: number; // 収入 >= 0、支出 < 0
  currency: string;
  description: string;
  memo: string | null;
  category: string;
  account: string;
  work: string;
  isSpecial: boolean;
  specialNote: string | null;
}

export interface CategoryGroup {
  id: string;
  label: string;
  color: string;
}

export interface CategoryInfo {
  label: string;
  group: string;
}

export interface CategoriesData {
  groups: CategoryGroup[];
  categories: Record<string, CategoryInfo>;
}

export interface MonthMeta {
  month: string; // YYYY-MM
  isSpecial: boolean;
  note: string | null;
  balanceStart: number;
  balanceEnd: number;
}

export interface BudgetsData {
  monthlyBudgets: Record<string, number>;
  savingsTarget: number;
  note?: string | null;
}

/** 集計から除外するグループ（カード返済・口座振替）。二重計上防止のため。 */
const EXCLUDED_GROUP = "excluded";
/** categories.json に存在しない未知カテゴリの割り当て先。 */
const UNKNOWN_GROUP = "other";

export interface MonthAggregate {
  income: number; // >= 0
  expense: number; // <= 0
  net: number; // income + expense
  byGroup: Record<string, number>; // グループID -> 符号付き合計（excludedグループは含まない）
  transactionCount: number; // 集計に使った取引件数（excluded・特別出費除外分は含まない）
}

/** 取引のカテゴリからグループIDを引く。未知カテゴリは "other" 扱い。 */
export function groupIdForCategory(
  category: string,
  categories: CategoriesData,
): string {
  return categories.categories[category]?.group ?? UNKNOWN_GROUP;
}

/** 指定した月（YYYY-MM）に属する取引だけを抽出する。 */
export function transactionsInMonth(
  transactions: Transaction[],
  month: string,
): Transaction[] {
  return transactions.filter((t) => t.date.slice(0, 7) === month);
}

/**
 * 取引配列を集計する。excludedグループは常に除外。
 * options.excludeSpecial を true にすると isSpecial な取引も除外する
 * （「特別出費を除いた支出」トグル用）。
 */
export function aggregateMonth(
  transactions: Transaction[],
  categories: CategoriesData,
  options: { excludeSpecial?: boolean } = {},
): MonthAggregate {
  const byGroup: Record<string, number> = {};
  let income = 0;
  let expense = 0;
  let transactionCount = 0;

  for (const t of transactions) {
    if (options.excludeSpecial && t.isSpecial) continue;

    const groupId = groupIdForCategory(t.category, categories);
    if (groupId === EXCLUDED_GROUP) continue;

    transactionCount += 1;
    byGroup[groupId] = (byGroup[groupId] ?? 0) + t.amount;

    if (t.amount >= 0) {
      income += t.amount;
    } else {
      expense += t.amount;
    }
  }

  return { income, expense, net: income + expense, byGroup, transactionCount };
}

/** transactionsInMonth + aggregateMonth をまとめたショートカット。 */
export function aggregateForMonth(
  transactions: Transaction[],
  categories: CategoriesData,
  month: string,
  options: { excludeSpecial?: boolean } = {},
): MonthAggregate {
  return aggregateMonth(transactionsInMonth(transactions, month), categories, options);
}

export interface GroupAmount {
  groupId: string;
  label: string;
  color: string;
  amount: number; // 正の値（円）
}

/**
 * カテゴリグループ別支出（円グラフ用）。収入グループと、
 * その月ネットで支出がない（払い戻し超過などの）グループは含めない。
 */
export function expenseByGroup(
  aggregate: MonthAggregate,
  categories: CategoriesData,
): GroupAmount[] {
  const groupInfo = new Map(categories.groups.map((g) => [g.id, g]));
  const result: GroupAmount[] = [];

  for (const [groupId, sum] of Object.entries(aggregate.byGroup)) {
    if (groupId === "income") continue;
    const amount = -sum;
    if (amount <= 0) continue;
    const info = groupInfo.get(groupId);
    result.push({
      groupId,
      label: info?.label ?? groupId,
      color: info?.color ?? "#adb5bd",
      amount,
    });
  }

  return result.sort((a, b) => b.amount - a.amount);
}

export interface BudgetUsageItem {
  groupId: string;
  label: string;
  color: string;
  budget: number; // 円
  spent: number; // 円（正の値）
  remaining: number; // budget - spent（円、超過時は負）
  over: boolean;
}

/** グループごとの予算消化状況（予算バー用）。 */
export function budgetUsage(
  aggregate: MonthAggregate,
  budgets: BudgetsData,
  categories: CategoriesData,
): BudgetUsageItem[] {
  const groupInfo = new Map(categories.groups.map((g) => [g.id, g]));

  return Object.entries(budgets.monthlyBudgets).map(([groupId, budget]) => {
    const spent = Math.max(0, -(aggregate.byGroup[groupId] ?? 0));
    const info = groupInfo.get(groupId);
    return {
      groupId,
      label: info?.label ?? groupId,
      color: info?.color ?? "#adb5bd",
      budget,
      spent,
      remaining: budget - spent,
      over: spent > budget,
    };
  });
}

/** 貯金目標との差（net - savingsTarget）。正なら目標達成、負なら未達。 */
export function savingsGap(aggregate: MonthAggregate, budgets: BudgetsData): number {
  return aggregate.net - budgets.savingsTarget;
}

export interface MonthDiff {
  incomeDiff: number;
  expenseDiff: number;
  netDiff: number;
}

/** 前月比（current - previous）。データがない月は aggregateMonth([]) の0値を渡せばよい。 */
export function monthOverMonthDiff(
  current: MonthAggregate,
  previous: MonthAggregate,
): MonthDiff {
  return {
    incomeDiff: current.income - previous.income,
    expenseDiff: current.expense - previous.expense,
    netDiff: current.net - previous.net,
  };
}

/** "YYYY-MM" を delta ヶ月分ずらす（年またぎ対応）。 */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

/** referenceMonth を末尾として count ヶ月分の "YYYY-MM" 配列を古い順に返す。 */
export function trailingMonths(referenceMonth: string, count: number): string[] {
  const result: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    result.push(shiftMonth(referenceMonth, -i));
  }
  return result;
}

export function getMonthMeta(
  monthsMeta: MonthMeta[],
  month: string,
): MonthMeta | undefined {
  return monthsMeta.find((m) => m.month === month);
}

export interface TrendPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
  isSpecial: boolean;
  note: string | null;
}

/** 直近12ヶ月（既定）の月次推移。月次推移棒グラフ用。 */
export function monthlyTrend(
  transactions: Transaction[],
  categories: CategoriesData,
  monthsMeta: MonthMeta[],
  referenceMonth: string,
  options: { excludeSpecial?: boolean; count?: number } = {},
): TrendPoint[] {
  const months = trailingMonths(referenceMonth, options.count ?? 12);

  return months.map((month) => {
    const agg = aggregateForMonth(transactions, categories, month, {
      excludeSpecial: options.excludeSpecial,
    });
    const meta = getMonthMeta(monthsMeta, month);
    return {
      month,
      income: agg.income,
      expense: agg.expense,
      net: agg.net,
      isSpecial: meta?.isSpecial ?? false,
      note: meta?.note ?? null,
    };
  });
}

/** 現在日時から "YYYY-MM" を得る（ダッシュボードの月デフォルト用）。 */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
