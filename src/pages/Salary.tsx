import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { ApiError, DataConflictError, getData, putData } from "../lib/dataClient";
import {
  deductionTrend,
  gradeChangePoints,
  insertSalarySorted,
  salaryTrend,
  type SalaryEntry,
} from "../lib/salary";
import SalaryTrendChart from "../components/salary/SalaryTrendChart";
import DeductionChart from "../components/salary/DeductionChart";
import AddSalaryModal from "../components/salary/AddSalaryModal";
import "./Salary.css";

interface SalariesFile {
  salaries: SalaryEntry[];
}

export default function Salary() {
  const { user, signOutUser } = useAuth();

  const [file, setFile] = useState<{ sha: string; salaries: SalaryEntry[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ sha: string; salaries: SalaryEntry[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getData<SalariesFile>("salaries.json")
      .then((result) => {
        if (cancelled) return;
        setFile({ sha: result.sha, salaries: result.content.salaries });
      })
      .catch(() => {
        if (!cancelled) setLoadError("給与データを読み込めませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const salaries = useMemo(() => file?.salaries ?? [], [file]);
  const trend = useMemo(() => salaryTrend(salaries), [salaries]);
  const deductions = useMemo(() => deductionTrend(salaries), [salaries]);
  const gradeChanges = useMemo(() => gradeChangePoints(salaries), [salaries]);
  const knownGrades = useMemo(
    () => [...new Set(gradeChanges.map((g) => g.grade))],
    [gradeChanges],
  );

  async function handleAdd(entry: SalaryEntry) {
    if (!file) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nextSalaries = insertSalarySorted(file.salaries, entry);
      const message = `給与明細追加: ${entry.id}`;
      const result = await putData("salaries.json", file.sha, { salaries: nextSalaries }, message);
      setFile({ sha: result.sha, salaries: nextSalaries });
    } catch (err) {
      if (err instanceof DataConflictError) {
        const content = err.latest.content as SalariesFile;
        setConflict({ sha: err.latest.sha, salaries: content.salaries });
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
    setFile({ sha: conflict.sha, salaries: conflict.salaries });
    setConflict(null);
  }

  const loading = !file && !loadError;

  return (
    <main className="salary-page">
      <header className="dashboard-header">
        <h1>money-lens</h1>
        <div className="header-actions">
          <Link to="/">ホーム</Link>
          <Link to="/transactions">明細</Link>
          <Link to="/assets">資産</Link>
          <Link to="/settings">設定</Link>
          <span className="user-email">{user?.email}</span>
          <button type="button" onClick={() => void signOutUser()}>
            ログアウト
          </button>
        </div>
      </header>

      <h2>給与推移</h2>

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
          <div className="salary-toolbar">
            <button type="button" onClick={() => setShowAddModal(true)} disabled={saving}>
              + 給与明細を手動追加
            </button>
            {saving && <span className="pending-note">保存中...</span>}
          </div>

          <SalaryTrendChart data={trend} gradeChanges={gradeChanges} />
          <DeductionChart data={deductions} />

          {showAddModal && (
            <AddSalaryModal
              existingIds={salaries.map((s) => s.id)}
              knownGrades={knownGrades}
              onClose={() => setShowAddModal(false)}
              onAdd={(entry) => void handleAdd(entry)}
            />
          )}
        </>
      )}
    </main>
  );
}
