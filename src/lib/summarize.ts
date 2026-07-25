/**
 * POST /api/analyze に渡すサマリー(docs/api.md 準拠)を、既存の集計ロジック
 * (aggregate.ts)から組み立てる純関数。生の明細ではなく集計済みデータのみを
 * 送ることで、トークン節約とプロンプトの安定化を図る。
 */
import {
  aggregateForMonth,
  getMonthMeta,
  monthlyTrend,
  shiftMonth,
  type BudgetsData,
  type CategoriesData,
  type MonthMeta,
  type Transaction,
} from "./aggregate";

export interface AnalyzeSummary {
  byGroup: Record<string, number>;
  prevMonth: Record<string, number>;
  budgets: Record<string, number>;
  income: number;
  specialNotes: string[];
  recentMonthsTrend: { month: string; expense: number; income: number }[];
}

const DEFAULT_TREND_MONTHS = 6;

/** 対象月の特別出費フラグが立った月メモ・取引のメモをユニークに集める。 */
function collectSpecialNotes(
  transactions: Transaction[],
  monthsMeta: MonthMeta[],
  targetMonth: string,
): string[] {
  const notes: string[] = [];
  const seen = new Set<string>();

  const addNote = (note: string | null | undefined) => {
    if (!note || seen.has(note)) return;
    seen.add(note);
    notes.push(note);
  };

  const meta = getMonthMeta(monthsMeta, targetMonth);
  if (meta?.isSpecial) {
    addNote(meta.note);
  }

  for (const t of transactions) {
    if (t.date.slice(0, 7) !== targetMonth) continue;
    if (t.isSpecial) {
      addNote(t.specialNote);
    }
  }

  return notes;
}

/** AI分析API(POST /api/analyze)に送るサマリーを組み立てる。 */
export function buildAnalyzeSummary(params: {
  transactions: Transaction[];
  categories: CategoriesData;
  budgets: BudgetsData;
  monthsMeta: MonthMeta[];
  targetMonth: string;
  trendMonths?: number;
}): AnalyzeSummary {
  const {
    transactions,
    categories,
    budgets,
    monthsMeta,
    targetMonth,
    trendMonths = DEFAULT_TREND_MONTHS,
  } = params;

  const previousMonth = shiftMonth(targetMonth, -1);
  const currentAgg = aggregateForMonth(transactions, categories, targetMonth);
  const previousAgg = aggregateForMonth(transactions, categories, previousMonth);

  const recentMonthsTrend = monthlyTrend(
    transactions,
    categories,
    monthsMeta,
    targetMonth,
    { count: trendMonths },
  ).map((t) => ({ month: t.month, expense: t.expense, income: t.income }));

  return {
    byGroup: currentAgg.byGroup,
    prevMonth: previousAgg.byGroup,
    budgets: budgets.monthlyBudgets,
    income: currentAgg.income,
    specialNotes: collectSpecialNotes(transactions, monthsMeta, targetMonth),
    recentMonthsTrend,
  };
}
