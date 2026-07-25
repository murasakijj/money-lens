import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { ApiError, DataConflictError, getData, putData } from "../lib/dataClient";
import type { CategoriesData, Transaction } from "../lib/aggregate";
import {
  addUnknownCategories,
  assignImportIds,
  buildImportPreview,
  groupRowsByYear,
  parseImportCsv,
  type ImportPreview,
} from "../lib/csvImport";
import "./Import.css";

interface TransactionsFile {
  year: number;
  transactions: Transaction[];
}

interface YearFileState {
  sha: string | null;
  transactions: Transaction[];
}

interface ImportResult {
  addedCounts: Record<number, number>;
  duplicateCount: number;
  period: { start: string; end: string } | null;
  newCategories: string[];
}

function byDateAsc(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export default function Import() {
  const { user, signOutUser } = useAuth();

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoriesData | null>(null);
  const [categoriesSha, setCategoriesSha] = useState<string | null>(null);
  const [masterError, setMasterError] = useState<string | null>(null);

  // 年ごとの transactions/{year}.json（プレビューに必要な年のみ読み込む）。
  const [yearFiles, setYearFiles] = useState<Record<number, YearFileState>>({});
  const [yearFilesError, setYearFilesError] = useState<string | null>(null);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // カテゴリマスタは一度だけ読み込む。
  useEffect(() => {
    let cancelled = false;
    getData<CategoriesData>("categories.json")
      .then((c) => {
        if (cancelled) return;
        setCategories(c.content);
        setCategoriesSha(c.sha);
      })
      .catch(() => {
        if (!cancelled) setMasterError("カテゴリマスタを読み込めませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const quickParse = useMemo(() => parseImportCsv(text), [text]);
  const neededYears = useMemo(
    () => [...groupRowsByYear(quickParse.rows).keys()].sort((a, b) => a - b),
    [quickParse.rows],
  );
  const missingYears = neededYears.filter((y) => yearFiles[y] === undefined);

  // プレビューに必要な年のtransactionsファイルを読み込む（未取得分のみ）。
  useEffect(() => {
    if (missingYears.length === 0) return;
    let cancelled = false;

    Promise.all(
      missingYears.map((year) =>
        getData<TransactionsFile>(`transactions/${year}.json`)
          .then((file) => [year, { sha: file.sha, transactions: file.content.transactions }] as const)
          .catch((err: unknown) => {
            if (err instanceof ApiError && err.status === 404) {
              return [year, { sha: null, transactions: [] as Transaction[] }] as const;
            }
            throw err;
          }),
      ),
    )
      .then((entries) => {
        if (cancelled) return;
        setYearFiles((prev) => {
          const next = { ...prev };
          for (const [year, state] of entries) next[year] = state;
          return next;
        });
        setYearFilesError(null);
      })
      .catch(() => {
        if (!cancelled) setYearFilesError("既存の取引データを読み込めませんでした。");
      });

    return () => {
      cancelled = true;
    };
    // missingYearsは配列なので、内容（年の集合）が変わったときだけ再実行したい。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingYears.join(",")]);

  const yearsReady = neededYears.every((y) => yearFiles[y] !== undefined);

  const existingForPreview = useMemo(
    () => neededYears.flatMap((y) => yearFiles[y]?.transactions ?? []),
    [neededYears, yearFiles],
  );

  const preview: ImportPreview | null = useMemo(() => {
    if (!categories || text.trim() === "" || !yearsReady) return null;
    return buildImportPreview(text, existingForPreview, categories);
  }, [text, categories, yearsReady, existingForPreview]);

  function resetOutcome() {
    setResult(null);
    setCommitError(null);
    setConflict(false);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      resetOutcome();
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  function handleTextChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setFileName(null);
    setText(e.target.value);
    resetOutcome();
  }

  async function handleConfirm() {
    if (!preview || !categories || preview.newRows.length === 0) return;
    setCommitting(true);
    setCommitError(null);
    setConflict(false);

    try {
      if (preview.unknownCategories.length > 0) {
        const updatedCategories = addUnknownCategories(categories, preview.unknownCategories);
        const res = await putData(
          "categories.json",
          categoriesSha,
          updatedCategories,
          `CSVインポート: 未知カテゴリを追加(${preview.unknownCategories.join(", ")})`,
        );
        setCategories(updatedCategories);
        setCategoriesSha(res.sha);
      }

      const byYear = groupRowsByYear(preview.newRows);
      const addedCounts: Record<number, number> = {};
      const nextYearFiles = { ...yearFiles };

      for (const [year, rows] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
        const base = nextYearFiles[year] ?? { sha: null, transactions: [] };
        const newTransactions = assignImportIds(
          rows,
          year,
          base.transactions.map((t) => t.id),
        );
        const merged = [...base.transactions, ...newTransactions].sort(byDateAsc);
        const period = preview.period;
        const message = `CSVインポート${period ? `(${period.start}〜${period.end})` : ""}: ${year}年 新規${newTransactions.length}件（重複${preview.duplicateRows.length}件除外）`;
        const res = await putData(
          `transactions/${year}.json`,
          base.sha,
          { year, transactions: merged },
          message,
        );
        nextYearFiles[year] = { sha: res.sha, transactions: merged };
        addedCounts[year] = newTransactions.length;
      }

      setYearFiles(nextYearFiles);
      setResult({
        addedCounts,
        duplicateCount: preview.duplicateRows.length,
        period: preview.period,
        newCategories: preview.unknownCategories,
      });
      setText("");
      setFileName(null);
    } catch (err) {
      if (err instanceof DataConflictError) {
        setConflict(true);
      } else if (err instanceof ApiError) {
        setCommitError(`取り込みに失敗しました（${err.message}）。`);
      } else {
        setCommitError("取り込みに失敗しました。");
      }
    } finally {
      setCommitting(false);
    }
  }

  const error = masterError ?? yearFilesError;
  const parsing = text.trim() !== "" && !preview && !error;

  return (
    <main className="import-page">
      <header className="dashboard-header">
        <h1>money-lens</h1>
        <div className="header-actions">
          <Link to="/">ホーム</Link>
          <Link to="/transactions">明細</Link>
          <Link to="/salary">給与</Link>
          <Link to="/assets">資産</Link>
          <Link to="/settings">設定</Link>
          <span className="user-email">{user?.email}</span>
          <button type="button" onClick={() => void signOutUser()}>
            ログアウト
          </button>
        </div>
      </header>

      <h2>CSVインポート</h2>

      {error && <p role="alert">{error}</p>}

      <section className="import-section">
        <label className="import-file-label">
          <span>ファイル選択</span>
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        </label>
        {fileName && <p className="import-filename">選択中: {fileName}</p>}

        <label className="import-field">
          <span>またはCSVを貼り付け</span>
          <textarea
            className="import-textarea"
            rows={8}
            value={text}
            onChange={handleTextChange}
            placeholder='"Date","Amount","Account Currency","Description","Memo","Receipt","Category","Account Name","Account Number","Work" ...'
          />
        </label>
      </section>

      {parsing && <p role="status">読み込んでいます...</p>}

      {quickParse.errors.length > 0 && text.trim() !== "" && (
        <section className="import-section import-errors">
          <h3>取り込めない行があります（{quickParse.errors.length}件、これらは除外されます）</h3>
          <ul>
            {quickParse.errors.slice(0, 20).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {quickParse.errors.length > 20 && <p>他{quickParse.errors.length - 20}件...</p>}
        </section>
      )}

      {preview && (
        <section className="import-section import-preview">
          <h3>プレビュー</h3>
          <dl className="import-summary">
            <div>
              <dt>件数</dt>
              <dd>{preview.totalRows}件</dd>
            </div>
            <div>
              <dt>期間</dt>
              <dd>{preview.period ? `${preview.period.start} 〜 ${preview.period.end}` : "-"}</dd>
            </div>
            <div>
              <dt>新規</dt>
              <dd className="import-highlight">{preview.newRows.length}件</dd>
            </div>
            <div>
              <dt>重複の可能性（除外）</dt>
              <dd>{preview.duplicateRows.length}件</dd>
            </div>
          </dl>

          {preview.unknownCategories.length > 0 && (
            <div className="import-unknown-categories">
              <p>
                未知のカテゴリが{preview.unknownCategories.length}件あります。取り込み時に
                「その他」グループとして自動追加されます。
              </p>
              <ul className="import-badge-list">
                {preview.unknownCategories.map((c) => (
                  <li key={c} className="import-badge">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.newRows.length === 0 && (
            <p className="empty-note">新規の明細はありません（すべて重複と判定されました）。</p>
          )}

          {commitError && <p role="alert">{commitError}</p>}
          {conflict && (
            <p role="alert">
              他の変更と競合したため保存できませんでした。ページを再読み込みしてから、もう一度お試しください。
            </p>
          )}

          <button
            type="button"
            className="primary-button"
            disabled={committing || preview.newRows.length === 0}
            onClick={() => void handleConfirm()}
          >
            {committing ? "取り込み中..." : `新規${preview.newRows.length}件を取り込む`}
          </button>
        </section>
      )}

      {result && (
        <section className="import-section import-result" role="status">
          <h3>取り込み完了</h3>
          <dl className="import-summary">
            <div>
              <dt>期間</dt>
              <dd>{result.period ? `${result.period.start} 〜 ${result.period.end}` : "-"}</dd>
            </div>
            <div>
              <dt>追加</dt>
              <dd className="import-highlight">
                {Object.entries(result.addedCounts)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([year, n]) => `${year}年 ${n}件`)
                  .join(" / ")}
              </dd>
            </div>
            <div>
              <dt>重複スキップ</dt>
              <dd>{result.duplicateCount}件</dd>
            </div>
          </dl>
          {result.newCategories.length > 0 && (
            <p>
              新規カテゴリを追加しました: {result.newCategories.join(", ")}（設定画面で日本語ラベル・グループを調整できます）
            </p>
          )}
        </section>
      )}
    </main>
  );
}
