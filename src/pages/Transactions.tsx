import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { ApiError, DataConflictError, getData, putData } from "../lib/dataClient";
import { currentMonth, type CategoriesData, type Transaction } from "../lib/aggregate";
import {
  addTransaction,
  distinctAccounts,
  emptyEditSession,
  filterTransactions,
  hasPendingChanges,
  removeTransaction,
  resolveTransactions,
  summarizeEditSession,
  upsertUpdate,
  type EditSessionState,
  type TransactionFilters,
  type TransactionUpdate,
} from "../lib/transactionEdits";
import FilterBar from "../components/transactions/FilterBar";
import TransactionList from "../components/transactions/TransactionList";
import EditTransactionModal from "../components/transactions/EditTransactionModal";
import AddTransactionModal from "../components/transactions/AddTransactionModal";
import "./Transactions.css";

interface TransactionsFile {
  year: number;
  transactions: Transaction[];
}

interface SettingsFile {
  accounts: string[];
}

export default function Transactions() {
  const { user, signOutUser } = useAuth();

  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    month: currentMonth(),
    groupId: "all",
    account: "all",
    keyword: "",
  }));
  const year = Number(filters.month.slice(0, 4));

  const [categories, setCategories] = useState<CategoriesData | null>(null);
  const [knownAccounts, setKnownAccounts] = useState<string[]>([]);
  const [masterError, setMasterError] = useState<string | null>(null);

  // 選択中の年のtransactionsファイル。sha=nullはまだGitHub上に存在しない新規年ファイル。
  const [txFile, setTxFile] = useState<{
    year: number;
    sha: string | null;
    transactions: Transaction[];
  } | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const [session, setSession] = useState<EditSessionState>(emptyEditSession);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ sha: string; transactions: Transaction[] } | null>(
    null,
  );

  // カテゴリ・口座マスタは月に依存しないので一度だけ読み込む。
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getData<CategoriesData>("categories.json"),
      getData<SettingsFile>("settings.json"),
    ])
      .then(([c, s]) => {
        if (cancelled) return;
        setCategories(c.content);
        setKnownAccounts(s.content.accounts);
      })
      .catch(() => {
        if (!cancelled) {
          setMasterError("マスタデータ（カテゴリ・設定）を読み込めませんでした。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 選択中の年のtransactionsファイルを読み込む。
  useEffect(() => {
    let cancelled = false;
    getData<TransactionsFile>(`transactions/${year}.json`)
      .then((file) => {
        if (cancelled) return;
        setTxFile({ year, sha: file.sha, transactions: file.content.transactions });
        setTxError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          // その年のファイルがまだ存在しない場合は新規作成扱い。
          setTxFile({ year, sha: null, transactions: [] });
          setTxError(null);
          return;
        }
        setTxError("取引データを読み込めませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const txReady = txFile?.year === year;

  const resolvedTransactions = useMemo(
    () => (txReady && txFile ? resolveTransactions(txFile.transactions, session) : []),
    [txReady, txFile, session],
  );

  const displayedTransactions = useMemo(
    () => (categories ? filterTransactions(resolvedTransactions, categories, filters) : []),
    [resolvedTransactions, categories, filters],
  );

  const accounts = useMemo(
    () => distinctAccounts(resolvedTransactions, knownAccounts),
    [resolvedTransactions, knownAccounts],
  );

  const editingTransaction = editingId
    ? (resolvedTransactions.find((t) => t.id === editingId) ?? null)
    : null;

  const pending = hasPendingChanges(session);

  function handleMonthChange(newMonth: string) {
    const newYear = Number(newMonth.slice(0, 4));
    if (newYear !== year && pending) {
      const ok = window.confirm(
        "保存されていない変更があります。年をまたいで移動すると、この変更は失われます。続行しますか？",
      );
      if (!ok) return;
      setSession(emptyEditSession());
    }
    setFilters((f) => ({ ...f, month: newMonth }));
  }

  function handleFilterChange(patch: Partial<Omit<TransactionFilters, "month">>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  function handleUpdate(id: string, patch: TransactionUpdate) {
    setSession((s) => upsertUpdate(s, id, patch));
  }

  function handleDelete(id: string) {
    setSession((s) => removeTransaction(s, id));
  }

  function handleAdd(t: Transaction) {
    setSession((s) => addTransaction(s, t));
  }

  async function handleSave() {
    if (!txFile || !pending) return;
    setSaving(true);
    setSaveError(null);
    try {
      const finalTransactions = resolveTransactions(txFile.transactions, session);
      const message = `明細編集(${filters.month}): ${summarizeEditSession(session)}`;
      const result = await putData(
        `transactions/${year}.json`,
        txFile.sha,
        { year, transactions: finalTransactions },
        message,
      );
      setTxFile({ year, sha: result.sha, transactions: finalTransactions });
      setSession(emptyEditSession());
    } catch (err) {
      if (err instanceof DataConflictError) {
        const content = err.latest.content as TransactionsFile;
        setConflict({ sha: err.latest.sha, transactions: content.transactions });
      } else if (err instanceof ApiError) {
        setSaveError(`保存に失敗しました（${err.message}）。`);
      } else {
        setSaveError("保存に失敗しました。");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleReloadAfterConflict() {
    if (!conflict) return;
    setTxFile({ year, sha: conflict.sha, transactions: conflict.transactions });
    setSession(emptyEditSession());
    setConflict(null);
  }

  const error = masterError ?? txError;
  const loading = !categories || !txReady;

  return (
    <main className="transactions-page">
      <header className="dashboard-header">
        <h1>money-lens</h1>
        <div className="header-actions">
          <Link to="/">ホーム</Link>
          <Link to="/import">インポート</Link>
          <Link to="/salary">給与</Link>
          <Link to="/assets">資産</Link>
          <Link to="/settings">設定</Link>
          <span className="user-email">{user?.email}</span>
          <button type="button" onClick={() => void signOutUser()}>
            ログアウト
          </button>
        </div>
      </header>

      {error && <p role="alert">{error}</p>}

      {conflict && (
        <div className="conflict-banner" role="alert">
          <p>
            他の変更と競合したため保存できませんでした。最新のデータを読み込み直してください（未保存の編集は失われます）。
          </p>
          <button type="button" onClick={handleReloadAfterConflict}>
            最新を読み込み直す
          </button>
        </div>
      )}

      {saveError && <p role="alert">{saveError}</p>}

      {loading && !error && <p role="status">読み込んでいます...</p>}

      {!loading && categories && (
        <>
          <FilterBar
            filters={filters}
            categories={categories}
            accounts={accounts}
            onMonthChange={handleMonthChange}
            onChange={handleFilterChange}
          />

          <div className="transactions-toolbar">
            <button type="button" onClick={() => setShowAddModal(true)}>
              + 手動追加
            </button>
            <div className="save-bar">
              {pending && <span className="pending-note">{summarizeEditSession(session)}（未保存）</span>}
              <button
                type="button"
                className="primary-button"
                disabled={!pending || saving}
                onClick={() => void handleSave()}
              >
                {saving ? "保存中..." : "変更を保存"}
              </button>
            </div>
          </div>

          <TransactionList
            transactions={displayedTransactions}
            categories={categories}
            onSelect={setEditingId}
          />

          {editingTransaction && (
            <EditTransactionModal
              transaction={editingTransaction}
              categories={categories}
              onClose={() => setEditingId(null)}
              onSave={(patch) => handleUpdate(editingTransaction.id, patch)}
              onDelete={() => handleDelete(editingTransaction.id)}
            />
          )}

          {showAddModal && (
            <AddTransactionModal
              year={year}
              defaultDate={`${filters.month}-01`}
              categories={categories}
              accounts={accounts}
              existingIds={resolvedTransactions.map((t) => t.id)}
              onClose={() => setShowAddModal(false)}
              onAdd={handleAdd}
            />
          )}
        </>
      )}
    </main>
  );
}
