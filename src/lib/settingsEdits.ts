/**
 * /settings（カテゴリ管理・予算設定・口座管理）のロジック（純関数のみ）。
 *
 * 金額計算はすべて整数（円）で行う。浮動小数は一切使わない。
 * データの読み込み・保存（GitHub経由）はこのファイルでは行わない。
 */

import type { BudgetsData, CategoriesData, CategoryGroup } from "./aggregate";

/** budgetUsage/expenseByGroupが特別扱いするグループ（予算設定の対象外）。 */
export const NON_BUDGETABLE_GROUPS = new Set(["excluded", "income"]);

/** カテゴリの日本語ラベルを変更する（存在しないキーは何もしない）。 */
export function updateCategoryLabel(
  categories: CategoriesData,
  key: string,
  label: string,
): CategoriesData {
  const current = categories.categories[key];
  if (!current) return categories;
  return {
    ...categories,
    categories: {
      ...categories.categories,
      [key]: { ...current, label },
    },
  };
}

/** カテゴリの所属グループを変更する（存在しないキーは何もしない）。 */
export function updateCategoryGroup(
  categories: CategoriesData,
  key: string,
  groupId: string,
): CategoriesData {
  const current = categories.categories[key];
  if (!current) return categories;
  return {
    ...categories,
    categories: {
      ...categories.categories,
      [key]: { ...current, group: groupId },
    },
  };
}

/** 新規グループ用のID採番（`group-{n}`、既存と衝突する場合はインクリメント）。 */
export function createGroupId(existingIds: Iterable<string>): string {
  const used = new Set(existingIds);
  let n = used.size + 1;
  let id = `group-${n}`;
  while (used.has(id)) {
    n += 1;
    id = `group-${n}`;
  }
  return id;
}

/** グループを追加する（IDは自動採番）。 */
export function addGroup(
  categories: CategoriesData,
  label: string,
  color: string,
): CategoriesData {
  const id = createGroupId(categories.groups.map((g) => g.id));
  const group: CategoryGroup = { id, label, color };
  return { ...categories, groups: [...categories.groups, group] };
}

/** グループの色を変更する（存在しないIDは何もしない）。 */
export function updateGroupColor(
  categories: CategoriesData,
  groupId: string,
  color: string,
): CategoriesData {
  return {
    ...categories,
    groups: categories.groups.map((g) => (g.id === groupId ? { ...g, color } : g)),
  };
}

/**
 * 予算編集フォーム用: 各グループ（excluded/incomeを除く）の月間予算を
 * 表示用の文字列にする（未設定は空文字）。
 */
export function budgetTextsFromBudgets(
  budgets: BudgetsData,
  groups: CategoryGroup[],
): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const g of groups) {
    if (NON_BUDGETABLE_GROUPS.has(g.id)) continue;
    const value = budgets.monthlyBudgets[g.id];
    texts[g.id] = value === undefined ? "" : String(value);
  }
  return texts;
}

export interface ParsedBudgets {
  monthlyBudgets: Record<string, number>;
  /** 数値変換に失敗した（空でないのに整数でない）グループのラベル一覧。 */
  invalidGroupIds: string[];
}

/** 予算編集フォームの文字列マップを検証・変換する。空文字はその予算未設定として扱う。 */
export function parseBudgetTexts(texts: Record<string, string>): ParsedBudgets {
  const monthlyBudgets: Record<string, number> = {};
  const invalidGroupIds: string[] = [];
  for (const [groupId, text] of Object.entries(texts)) {
    const trimmed = text.trim();
    if (trimmed === "") continue;
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 0) {
      invalidGroupIds.push(groupId);
      continue;
    }
    monthlyBudgets[groupId] = n;
  }
  return { monthlyBudgets, invalidGroupIds };
}

/** 貯金目標（円）を検証・変換する。整数でなければnullを返す。 */
export function parseSavingsTarget(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return null;
  return n;
}

/** 口座名を追加する（空文字・既存と重複する場合は変更しない）。 */
export function addAccount(accounts: string[], name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed || accounts.includes(trimmed)) return accounts;
  return [...accounts, trimmed];
}

/** 口座名を変更する（空文字・他の口座と重複する場合は変更しない）。 */
export function renameAccount(accounts: string[], index: number, name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return accounts;
  if (accounts.some((a, i) => i !== index && a === trimmed)) return accounts;
  return accounts.map((a, i) => (i === index ? trimmed : a));
}
