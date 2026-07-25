import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { ApiError, DataConflictError, getData, putData } from "../lib/dataClient";
import type { BudgetsData, CategoriesData } from "../lib/aggregate";
import { groupedCategoryOptions } from "../lib/transactionEdits";
import {
  NON_BUDGETABLE_GROUPS,
  addAccount,
  addGroup,
  budgetTextsFromBudgets,
  parseBudgetTexts,
  parseSavingsTarget,
  renameAccount,
  updateCategoryGroup,
  updateCategoryLabel,
  updateGroupColor,
} from "../lib/settingsEdits";
import "./Settings.css";

interface SettingsFile {
  appVersion: number;
  accounts: string[];
  importProfiles: unknown[];
}

const DEFAULT_NEW_GROUP_COLOR = "#adb5bd";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return `保存に失敗しました（${err.message}）。`;
  return "保存に失敗しました。";
}

export default function Settings() {
  const { user, signOutUser } = useAuth();

  // --- カテゴリ管理 ---
  const [categoriesFile, setCategoriesFile] = useState<{ sha: string; content: CategoriesData } | null>(
    null,
  );
  const [categoriesDraft, setCategoriesDraft] = useState<CategoriesData | null>(null);
  const [categoriesDirty, setCategoriesDirty] = useState(false);
  const [categoriesSaving, setCategoriesSaving] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoriesConflict, setCategoriesConflict] = useState<{ sha: string; content: CategoriesData } | null>(
    null,
  );
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(DEFAULT_NEW_GROUP_COLOR);

  // --- 予算設定 ---
  const [budgetsFile, setBudgetsFile] = useState<{ sha: string; content: BudgetsData } | null>(null);
  const [budgetTexts, setBudgetTexts] = useState<Record<string, string>>({});
  const [savingsTargetText, setSavingsTargetText] = useState("");
  const [budgetsSaving, setBudgetsSaving] = useState(false);
  const [budgetsError, setBudgetsError] = useState<string | null>(null);
  const [budgetsConflict, setBudgetsConflict] = useState<{ sha: string; content: BudgetsData } | null>(null);

  // --- 口座管理 ---
  const [settingsFile, setSettingsFile] = useState<{ sha: string; content: SettingsFile } | null>(null);
  const [accountsDraft, setAccountsDraft] = useState<string[]>([]);
  const [newAccountName, setNewAccountName] = useState("");
  const [accountsSaving, setAccountsSaving] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountsConflict, setAccountsConflict] = useState<{ sha: string; content: SettingsFile } | null>(
    null,
  );

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getData<CategoriesData>("categories.json"),
      getData<BudgetsData>("budgets.json"),
      getData<SettingsFile>("settings.json"),
    ])
      .then(([c, b, s]) => {
        if (cancelled) return;
        setCategoriesFile({ sha: c.sha, content: c.content });
        setCategoriesDraft(c.content);
        setBudgetsFile({ sha: b.sha, content: b.content });
        setBudgetTexts(budgetTextsFromBudgets(b.content, c.content.groups));
        setSavingsTargetText(String(b.content.savingsTarget));
        setSettingsFile({ sha: s.sha, content: s.content });
        setAccountsDraft(s.content.accounts);
      })
      .catch(() => {
        if (!cancelled) setLoadError("設定データを読み込めませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groupedCategories = useMemo(
    () => (categoriesDraft ? groupedCategoryOptions(categoriesDraft) : []),
    [categoriesDraft],
  );

  const budgetableGroups = useMemo(
    () => (categoriesDraft ? categoriesDraft.groups.filter((g) => !NON_BUDGETABLE_GROUPS.has(g.id)) : []),
    [categoriesDraft],
  );

  // --- カテゴリ管理: ハンドラ ---

  function handleCategoryLabelChange(key: string, label: string) {
    setCategoriesDraft((draft) => (draft ? updateCategoryLabel(draft, key, label) : draft));
    setCategoriesDirty(true);
  }

  function handleCategoryGroupChange(key: string, groupId: string) {
    setCategoriesDraft((draft) => (draft ? updateCategoryGroup(draft, key, groupId) : draft));
    setCategoriesDirty(true);
  }

  function handleGroupColorChange(groupId: string, color: string) {
    setCategoriesDraft((draft) => (draft ? updateGroupColor(draft, groupId, color) : draft));
    setCategoriesDirty(true);
  }

  function handleAddGroup() {
    if (!categoriesDraft) return;
    const label = newGroupLabel.trim();
    if (!label) {
      setCategoriesError("グループ名を入力してください。");
      return;
    }
    setCategoriesError(null);
    const nextCategories = addGroup(categoriesDraft, label, newGroupColor);
    const newGroupId = nextCategories.groups[nextCategories.groups.length - 1].id;
    setCategoriesDraft(nextCategories);
    setCategoriesDirty(true);
    setNewGroupLabel("");
    setNewGroupColor(DEFAULT_NEW_GROUP_COLOR);
    // 新しいグループは予算未設定のまま追加する（予算フォームにも空欄で表示されるようにする）。
    setBudgetTexts((texts) => ({ ...texts, [newGroupId]: "" }));
  }

  async function handleSaveCategories() {
    if (!categoriesFile || !categoriesDraft) return;
    setCategoriesSaving(true);
    setCategoriesError(null);
    try {
      const result = await putData(
        "categories.json",
        categoriesFile.sha,
        categoriesDraft,
        "設定画面: カテゴリ・グループを更新",
      );
      setCategoriesFile({ sha: result.sha, content: categoriesDraft });
      setCategoriesDirty(false);
    } catch (err) {
      if (err instanceof DataConflictError) {
        const content = err.latest.content as CategoriesData;
        setCategoriesConflict({ sha: err.latest.sha, content });
      } else {
        setCategoriesError(errorMessage(err));
      }
    } finally {
      setCategoriesSaving(false);
    }
  }

  function handleReloadCategoriesAfterConflict() {
    if (!categoriesConflict) return;
    setCategoriesFile(categoriesConflict);
    setCategoriesDraft(categoriesConflict.content);
    setCategoriesDirty(false);
    setCategoriesConflict(null);
  }

  // --- 予算設定: ハンドラ ---

  function handleBudgetTextChange(groupId: string, text: string) {
    setBudgetTexts((texts) => ({ ...texts, [groupId]: text }));
  }

  async function handleSaveBudgets() {
    if (!budgetsFile) return;
    const { monthlyBudgets, invalidGroupIds } = parseBudgetTexts(budgetTexts);
    if (invalidGroupIds.length > 0) {
      const labels = invalidGroupIds
        .map((id) => budgetableGroups.find((g) => g.id === id)?.label ?? id)
        .join("、");
      setBudgetsError(`${labels} の予算は0以上の整数で入力してください。`);
      return;
    }
    const savingsTarget = parseSavingsTarget(savingsTargetText);
    if (savingsTarget === null) {
      setBudgetsError("貯金目標は整数で入力してください。");
      return;
    }

    setBudgetsSaving(true);
    setBudgetsError(null);
    try {
      const nextBudgets: BudgetsData = { ...budgetsFile.content, monthlyBudgets, savingsTarget };
      const result = await putData(
        "budgets.json",
        budgetsFile.sha,
        nextBudgets,
        "設定画面: 予算を更新",
      );
      setBudgetsFile({ sha: result.sha, content: nextBudgets });
    } catch (err) {
      if (err instanceof DataConflictError) {
        const content = err.latest.content as BudgetsData;
        setBudgetsConflict({ sha: err.latest.sha, content });
      } else {
        setBudgetsError(errorMessage(err));
      }
    } finally {
      setBudgetsSaving(false);
    }
  }

  function handleReloadBudgetsAfterConflict() {
    if (!budgetsConflict || !categoriesDraft) return;
    setBudgetsFile(budgetsConflict);
    setBudgetTexts(budgetTextsFromBudgets(budgetsConflict.content, categoriesDraft.groups));
    setSavingsTargetText(String(budgetsConflict.content.savingsTarget));
    setBudgetsConflict(null);
  }

  // --- 口座管理: ハンドラ ---

  function handleAccountRename(index: number, name: string) {
    setAccountsDraft((draft) => renameAccount(draft, index, name));
  }

  function handleAddAccount() {
    const next = addAccount(accountsDraft, newAccountName);
    if (next === accountsDraft) {
      setAccountsError("口座名を入力してください（既存の口座名と重複しないようにしてください）。");
      return;
    }
    setAccountsError(null);
    setAccountsDraft(next);
    setNewAccountName("");
  }

  async function handleSaveAccounts() {
    if (!settingsFile) return;
    if (accountsDraft.some((a) => a.trim() === "")) {
      setAccountsError("空の口座名があります。");
      return;
    }
    setAccountsSaving(true);
    setAccountsError(null);
    try {
      const nextContent: SettingsFile = { ...settingsFile.content, accounts: accountsDraft };
      const result = await putData(
        "settings.json",
        settingsFile.sha,
        nextContent,
        "設定画面: 口座を更新",
      );
      setSettingsFile({ sha: result.sha, content: nextContent });
    } catch (err) {
      if (err instanceof DataConflictError) {
        const content = err.latest.content as SettingsFile;
        setAccountsConflict({ sha: err.latest.sha, content });
      } else {
        setAccountsError(errorMessage(err));
      }
    } finally {
      setAccountsSaving(false);
    }
  }

  function handleReloadAccountsAfterConflict() {
    if (!accountsConflict) return;
    setSettingsFile(accountsConflict);
    setAccountsDraft(accountsConflict.content.accounts);
    setAccountsConflict(null);
  }

  const loading = !categoriesDraft || !budgetsFile || !settingsFile;

  return (
    <main className="settings-page">
      <header className="dashboard-header">
        <h1>money-lens</h1>
        <div className="header-actions">
          <Link to="/">ホーム</Link>
          <Link to="/transactions">明細</Link>
          <Link to="/salary">給与</Link>
          <Link to="/assets">資産</Link>
          <span className="user-email">{user?.email}</span>
          <button type="button" onClick={() => void signOutUser()}>
            ログアウト
          </button>
        </div>
      </header>

      <h2>設定</h2>

      {loadError && <p role="alert">{loadError}</p>}
      {loading && !loadError && <p role="status">読み込んでいます...</p>}

      {!loading && categoriesDraft && (
        <section className="settings-section">
          <h3>カテゴリ管理</h3>

          {categoriesError && <p role="alert">{categoriesError}</p>}

          {categoriesConflict && (
            <div className="conflict-banner" role="alert">
              <p>
                他の変更と競合したため保存できませんでした。最新のデータを読み込み直してください（未保存の編集は失われます）。
              </p>
              <button type="button" onClick={handleReloadCategoriesAfterConflict}>
                最新を読み込み直す
              </button>
            </div>
          )}

          <div className="settings-subsection">
            <h4>グループ</h4>
            <ul className="group-list">
              {categoriesDraft.groups.map((g) => (
                <li key={g.id} className="group-row">
                  <input
                    type="color"
                    value={g.color}
                    onChange={(e) => handleGroupColorChange(g.id, e.target.value)}
                    aria-label={`${g.label}の色`}
                  />
                  <span className="group-label">{g.label}</span>
                  <span className="group-id">{g.id}</span>
                </li>
              ))}
            </ul>

            <div className="add-group-form">
              <input
                type="text"
                placeholder="新しいグループ名"
                value={newGroupLabel}
                onChange={(e) => setNewGroupLabel(e.target.value)}
              />
              <input
                type="color"
                value={newGroupColor}
                onChange={(e) => setNewGroupColor(e.target.value)}
                aria-label="新しいグループの色"
              />
              <button type="button" onClick={handleAddGroup}>
                + グループを追加
              </button>
            </div>
          </div>

          <div className="settings-subsection">
            <h4>カテゴリ（英語カテゴリ → 日本語ラベル・グループ）</h4>
            {groupedCategories.map(({ group, options }) => (
              <div key={group.id} className="category-group-block">
                <p className="category-group-heading">{group.label}</p>
                <ul className="category-list">
                  {options.map((opt) => (
                    <li key={opt.key} className="category-row">
                      <span className="category-key">{opt.key}</span>
                      <input
                        type="text"
                        value={categoriesDraft.categories[opt.key]?.label ?? ""}
                        onChange={(e) => handleCategoryLabelChange(opt.key, e.target.value)}
                        aria-label={`${opt.key}のラベル`}
                      />
                      <select
                        value={categoriesDraft.categories[opt.key]?.group ?? ""}
                        onChange={(e) => handleCategoryGroupChange(opt.key, e.target.value)}
                        aria-label={`${opt.key}のグループ`}
                      >
                        {categoriesDraft.groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="settings-save-bar">
            {categoriesDirty && <span className="pending-note">未保存の変更があります</span>}
            <button
              type="button"
              className="primary-button"
              disabled={!categoriesDirty || categoriesSaving}
              onClick={() => void handleSaveCategories()}
            >
              {categoriesSaving ? "保存中..." : "カテゴリ設定を保存"}
            </button>
          </div>
        </section>
      )}

      {!loading && budgetsFile && (
        <section className="settings-section">
          <h3>予算設定</h3>

          {budgetsError && <p role="alert">{budgetsError}</p>}

          {budgetsConflict && (
            <div className="conflict-banner" role="alert">
              <p>
                他の変更と競合したため保存できませんでした。最新のデータを読み込み直してください（未保存の編集は失われます）。
              </p>
              <button type="button" onClick={handleReloadBudgetsAfterConflict}>
                最新を読み込み直す
              </button>
            </div>
          )}

          <ul className="budget-list">
            {budgetableGroups.map((g) => (
              <li key={g.id} className="budget-row">
                <span className="group-label">{g.label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={0}
                  placeholder="未設定"
                  value={budgetTexts[g.id] ?? ""}
                  onChange={(e) => handleBudgetTextChange(g.id, e.target.value)}
                  aria-label={`${g.label}の月間予算`}
                />
                <span className="unit">円</span>
              </li>
            ))}
          </ul>

          <label className="modal-field savings-target-field">
            <span>貯金目標（月間・円）</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              min={0}
              value={savingsTargetText}
              onChange={(e) => setSavingsTargetText(e.target.value)}
            />
          </label>

          <div className="settings-save-bar">
            <button
              type="button"
              className="primary-button"
              disabled={budgetsSaving}
              onClick={() => void handleSaveBudgets()}
            >
              {budgetsSaving ? "保存中..." : "予算設定を保存"}
            </button>
          </div>
        </section>
      )}

      {!loading && settingsFile && (
        <section className="settings-section">
          <h3>口座管理</h3>

          {accountsError && <p role="alert">{accountsError}</p>}

          {accountsConflict && (
            <div className="conflict-banner" role="alert">
              <p>
                他の変更と競合したため保存できませんでした。最新のデータを読み込み直してください（未保存の編集は失われます）。
              </p>
              <button type="button" onClick={handleReloadAccountsAfterConflict}>
                最新を読み込み直す
              </button>
            </div>
          )}

          <ul className="account-list">
            {accountsDraft.map((account, i) => (
              <li key={i} className="account-row">
                <input
                  type="text"
                  value={account}
                  onChange={(e) => handleAccountRename(i, e.target.value)}
                  aria-label={`口座${i + 1}`}
                />
              </li>
            ))}
          </ul>

          <div className="add-account-form">
            <input
              type="text"
              placeholder="新しい口座名"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
            />
            <button type="button" onClick={handleAddAccount}>
              + 口座を追加
            </button>
          </div>

          <div className="settings-save-bar">
            <button
              type="button"
              className="primary-button"
              disabled={accountsSaving}
              onClick={() => void handleSaveAccounts()}
            >
              {accountsSaving ? "保存中..." : "口座設定を保存"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
