import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { ApiError, getData } from "../lib/dataClient";
import {
  aggregateForMonth,
  budgetUsage,
  currentMonth,
  expenseByGroup,
  getMonthMeta,
  monthOverMonthDiff,
  monthlyTrend,
  savingsGap,
  shiftMonth,
  trailingMonths,
  type BudgetsData,
  type CategoriesData,
  type MonthMeta,
  type Transaction,
} from "../lib/aggregate";
import MonthNav from "../components/dashboard/MonthNav";
import SummaryCard from "../components/dashboard/SummaryCard";
import CategoryPieChart from "../components/dashboard/CategoryPieChart";
import BudgetBars from "../components/dashboard/BudgetBars";
import TrendChart from "../components/dashboard/TrendChart";
import "./Home.css";

interface TransactionsFile {
  year: number;
  transactions: Transaction[];
}

interface MonthsFile {
  months: MonthMeta[];
}

export default function Home() {
  const { user, signOutUser } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonth());
  const [excludeSpecial, setExcludeSpecial] = useState(false);

  const [categories, setCategories] = useState<CategoriesData | null>(null);
  const [budgets, setBudgets] = useState<BudgetsData | null>(null);
  const [monthsMeta, setMonthsMeta] = useState<MonthMeta[]>([]);
  const [masterError, setMasterError] = useState<string | null>(null);

  // 取得済み取引と、それがどの月向けに取得されたものかを一緒に保持する。
  // （effect内で同期的にsetLoading(true)を呼ぶパターンを避けるため、
  //   「txResult.month === selectedMonth かどうか」で読み込み中かを判定する）
  const [txResult, setTxResult] = useState<{
    month: string;
    transactions: Transaction[];
  } | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // カテゴリ・予算・月次メモは月に依存しないので一度だけ読み込む。
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getData<CategoriesData>("categories.json"),
      getData<BudgetsData>("budgets.json"),
      getData<MonthsFile>("months.json"),
    ])
      .then(([c, b, m]) => {
        if (cancelled) return;
        setCategories(c.content);
        setBudgets(b.content);
        setMonthsMeta(m.content.months);
      })
      .catch(() => {
        if (!cancelled) {
          setMasterError(
            "マスタデータ（カテゴリ・予算・月次メモ）を読み込めませんでした。",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 選択月の直近12ヶ月推移に必要な年の transactions/{year}.json を読み込む。
  // dataClient側でファイル単位にキャッシュされるため、同じ年を再取得することはない。
  useEffect(() => {
    let cancelled = false;

    const months = trailingMonths(selectedMonth, 12);
    const years = Array.from(new Set(months.map((m) => Number(m.slice(0, 4)))));

    Promise.all(
      years.map((year) =>
        getData<TransactionsFile>(`transactions/${year}.json`)
          .then((file) => file.content.transactions)
          .catch((err: unknown) => {
            // その年のファイルがまだ存在しない場合は空扱い（正常系）。
            if (err instanceof ApiError && err.status === 404) return [];
            throw err;
          }),
      ),
    )
      .then((lists) => {
        if (cancelled) return;
        setTxResult({ month: selectedMonth, transactions: lists.flat() });
        setTxError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setTxError("取引データを読み込めませんでした。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const previousMonth = useMemo(
    () => shiftMonth(selectedMonth, -1),
    [selectedMonth],
  );

  const transactions = useMemo(
    () => txResult?.transactions ?? [],
    [txResult],
  );
  const txReady = txResult?.month === selectedMonth;

  const currentAgg = useMemo(
    () =>
      categories
        ? aggregateForMonth(transactions, categories, selectedMonth)
        : null,
    [transactions, categories, selectedMonth],
  );
  const previousAgg = useMemo(
    () =>
      categories
        ? aggregateForMonth(transactions, categories, previousMonth)
        : null,
    [transactions, categories, previousMonth],
  );
  const diff =
    currentAgg && previousAgg ? monthOverMonthDiff(currentAgg, previousAgg) : null;

  const pieData = useMemo(
    () => (currentAgg && categories ? expenseByGroup(currentAgg, categories) : []),
    [currentAgg, categories],
  );
  const budgetItems = useMemo(
    () =>
      currentAgg && budgets && categories
        ? budgetUsage(currentAgg, budgets, categories)
        : [],
    [currentAgg, budgets, categories],
  );
  const gap = currentAgg && budgets ? savingsGap(currentAgg, budgets) : 0;
  const trend = useMemo(
    () =>
      categories
        ? monthlyTrend(transactions, categories, monthsMeta, selectedMonth, {
            excludeSpecial,
            count: 12,
          })
        : [],
    [transactions, categories, monthsMeta, selectedMonth, excludeSpecial],
  );
  const monthMeta = getMonthMeta(monthsMeta, selectedMonth);

  const error = masterError ?? txError;
  const loading = !categories || !budgets || !txReady;

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <h1>money-lens</h1>
        <div className="header-actions">
          <Link to="/transactions">明細</Link>
          <Link to="/import">インポート</Link>
          <span className="user-email">{user?.email}</span>
          <button type="button" onClick={() => void signOutUser()}>
            ログアウト
          </button>
        </div>
      </header>

      <MonthNav
        month={selectedMonth}
        onPrev={() => setSelectedMonth((m) => shiftMonth(m, -1))}
        onNext={() => setSelectedMonth((m) => shiftMonth(m, 1))}
      />

      {error && <p role="alert">{error}</p>}

      {loading && !error && <p role="status">読み込んでいます...</p>}

      {!loading && currentAgg && budgets && (
        <>
          <SummaryCard
            income={currentAgg.income}
            expense={currentAgg.expense}
            net={currentAgg.net}
            savingsTarget={budgets.savingsTarget}
            gap={gap}
            diff={diff}
            monthMeta={monthMeta}
          />
          <CategoryPieChart data={pieData} />
          <BudgetBars items={budgetItems} />
          <TrendChart
            data={trend}
            excludeSpecial={excludeSpecial}
            onToggleExcludeSpecial={setExcludeSpecial}
          />
        </>
      )}
    </main>
  );
}
