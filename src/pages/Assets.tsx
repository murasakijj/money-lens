import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { ApiError, DataConflictError, getData, putData } from "../lib/dataClient";
import { currentMonth, type MonthMeta } from "../lib/aggregate";
import { sortMonthsChrono, upsertMonthMeta } from "../lib/assets";
import BalanceTrendChart from "../components/assets/BalanceTrendChart";
import AddBalanceModal from "../components/assets/AddBalanceModal";
import "./Assets.css";

interface MonthsFile {
  months: MonthMeta[];
}

export default function Assets() {
  const { user, signOutUser } = useAuth();

  const [file, setFile] = useState<{ sha: string; months: MonthMeta[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ sha: string; months: MonthMeta[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getData<MonthsFile>("months.json")
      .then((result) => {
        if (cancelled) return;
        setFile({ sha: result.sha, months: result.content.months });
      })
      .catch(() => {
        if (!cancelled) setLoadError("資産データを読み込めませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const months = useMemo(() => (file ? sortMonthsChrono(file.months) : []), [file]);

  async function handleSave(entry: MonthMeta) {
    if (!file) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nextMonths = upsertMonthMeta(file.months, entry);
      const message = `月末残高入力: ${entry.month}`;
      const result = await putData("months.json", file.sha, { months: nextMonths }, message);
      setFile({ sha: result.sha, months: nextMonths });
    } catch (err) {
      if (err instanceof DataConflictError) {
        const content = err.latest.content as MonthsFile;
        setConflict({ sha: err.latest.sha, months: content.months });
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
    setFile({ sha: conflict.sha, months: conflict.months });
    setConflict(null);
  }

  const loading = !file && !loadError;

  return (
    <main className="assets-page">
      <header className="dashboard-header">
        <h1>money-lens</h1>
        <div className="header-actions">
          <Link to="/">ホーム</Link>
          <Link to="/transactions">明細</Link>
          <Link to="/salary">給与</Link>
          <span className="user-email">{user?.email}</span>
          <button type="button" onClick={() => void signOutUser()}>
            ログアウト
          </button>
        </div>
      </header>

      <h2>資産推移</h2>

      {loadError && <p role="alert">{loadError}</p>}

      {conflict && (
        <div className="conflict-banner" role="alert">
          <p>
            他の変更と競合したため保存できませんでした。最新のデータを読み込み直してください。
          </p>
          <button type="button" onClick={handleReloadAfterConflict}>
            最新を読み込み直す
          </button>
        </div>
      )}

      {saveError && <p role="alert">{saveError}</p>}

      {loading && <p role="status">読み込んでいます...</p>}

      {file && (
        <>
          <div className="assets-toolbar">
            <button type="button" onClick={() => setShowAddModal(true)} disabled={saving}>
              + 月末残高を入力
            </button>
            {saving && <span className="pending-note">保存中...</span>}
          </div>

          <BalanceTrendChart data={months} />

          {showAddModal && (
            <AddBalanceModal
              existingMonths={months.map((m) => m.month)}
              defaultMonth={currentMonth()}
              onClose={() => setShowAddModal(false)}
              onSave={(entry) => void handleSave(entry)}
            />
          )}
        </>
      )}
    </main>
  );
}
