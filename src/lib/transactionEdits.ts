/**
 * /transactions（明細一覧・編集）のロジック（純関数のみ）。
 *
 * 編集（カテゴリ変更・★フラグ+メモ・削除）と手動追加は、画面内でローカルに
 * EditSessionState として溜め込み、保存操作でまとめて1回 putData を呼ぶ設計
 * （docs/ui.md「保存操作は編集セッション単位でまとめてPUT」）。
 * データの読み込み・保存（GitHub経由）はこのファイルでは行わない。
 */

import { groupIdForCategory, type CategoriesData, type Transaction } from "./aggregate";

export interface TransactionFilters {
  month: string; // "YYYY-MM"（必須）
  groupId: string; // categories.json の groups[].id、または "all"
  account: string; // 口座名、または "all"
  keyword: string; // 自由入力（前後空白は無視）
}

function sortByDate(a: Transaction, b: Transaction, direction: 1 | -1): number {
  if (a.date !== b.date) return a.date < b.date ? -direction : direction;
  if (a.id !== b.id) return a.id < b.id ? -direction : direction;
  return 0;
}

/** 一覧表示用: 新しい日付が先頭に来るよう降順にソートする。 */
function sortByDateDesc(a: Transaction, b: Transaction): number {
  return sortByDate(a, b, -1);
}

/** 保存用: 元データの並び（日付昇順）を踏襲する。 */
function sortByDateAsc(a: Transaction, b: Transaction): number {
  return sortByDate(a, b, 1);
}

/** 月・カテゴリグループ・口座・キーワードで取引をフィルタする（一覧表示用、日付降順）。 */
export function filterTransactions(
  transactions: Transaction[],
  categories: CategoriesData,
  filters: TransactionFilters,
): Transaction[] {
  const keyword = filters.keyword.trim().toLowerCase();

  return transactions
    .filter((t) => t.date.slice(0, 7) === filters.month)
    .filter(
      (t) =>
        filters.groupId === "all" ||
        groupIdForCategory(t.category, categories) === filters.groupId,
    )
    .filter((t) => filters.account === "all" || t.account === filters.account)
    .filter((t) => {
      if (!keyword) return true;
      const label = categories.categories[t.category]?.label ?? t.category;
      const haystack = [t.description, t.memo ?? "", label, t.category, t.specialNote ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    })
    .sort(sortByDateDesc);
}

/** 編集モーダルで変更できるフィールドのみ（docs/ui.md: カテゴリ変更・★フラグ+メモ）。 */
export interface TransactionUpdate {
  category?: string;
  isSpecial?: boolean;
  specialNote?: string | null;
}

/** 保存前のローカル編集内容。updates/deletedIds は既存取引向け、added は手動追加分。 */
export interface EditSessionState {
  updates: Record<string, TransactionUpdate>;
  deletedIds: Set<string>;
  added: Transaction[];
}

export function emptyEditSession(): EditSessionState {
  return { updates: {}, deletedIds: new Set(), added: [] };
}

/** 既存取引への変更を積む（同じ取引への複数回の変更はマージされる）。 */
export function upsertUpdate(
  session: EditSessionState,
  id: string,
  patch: TransactionUpdate,
): EditSessionState {
  const addedIndex = session.added.findIndex((t) => t.id === id);
  if (addedIndex >= 0) {
    const added = [...session.added];
    added[addedIndex] = { ...added[addedIndex], ...patch };
    return { ...session, added };
  }
  return {
    ...session,
    updates: { ...session.updates, [id]: { ...session.updates[id], ...patch } },
  };
}

/**
 * 取引を削除対象にする。手動追加分（まだ未保存）はセッションからそのまま除去し、
 * 既存取引は deletedIds に積む（保存時に除外する）。
 */
export function removeTransaction(session: EditSessionState, id: string): EditSessionState {
  const addedIndex = session.added.findIndex((t) => t.id === id);
  if (addedIndex >= 0) {
    return { ...session, added: session.added.filter((t) => t.id !== id) };
  }
  const deletedIds = new Set(session.deletedIds);
  deletedIds.add(id);
  const updates = { ...session.updates };
  delete updates[id];
  return { ...session, deletedIds, updates };
}

/** 手動追加の取引をセッションに積む。 */
export function addTransaction(session: EditSessionState, t: Transaction): EditSessionState {
  return { ...session, added: [...session.added, t] };
}

/** セッションに変更が1件以上あるか。保存ボタンの活性制御に使う。 */
export function hasPendingChanges(session: EditSessionState): boolean {
  return (
    Object.keys(session.updates).length > 0 ||
    session.deletedIds.size > 0 ||
    session.added.length > 0
  );
}

/** 元データ（年ファイルの transactions）にセッションの変更を適用した最終配列（保存用、日付昇順）。 */
export function resolveTransactions(
  base: Transaction[],
  session: EditSessionState,
): Transaction[] {
  const kept = base
    .filter((t) => !session.deletedIds.has(t.id))
    .map((t) => (session.updates[t.id] ? { ...t, ...session.updates[t.id] } : t));
  return [...kept, ...session.added].sort(sortByDateAsc);
}

/** コミットメッセージ・保存前確認用のセッション要約。 */
export function summarizeEditSession(session: EditSessionState): string {
  const parts: string[] = [];
  if (session.added.length > 0) parts.push(`追加${session.added.length}件`);
  const updateCount = Object.keys(session.updates).length;
  if (updateCount > 0) parts.push(`更新${updateCount}件`);
  if (session.deletedIds.size > 0) parts.push(`削除${session.deletedIds.size}件`);
  return parts.length > 0 ? parts.join("・") : "変更なし";
}

/**
 * 手動追加用のID採番（data-model.md: `t-{year}-{timestamp}`）。
 * 同一ミリ秒内の連続追加による衝突を避けるため、既存IDと衝突する場合はインクリメントする。
 */
export function createManualId(year: number, existingIds: Iterable<string>): string {
  const used = new Set(existingIds);
  let n = Date.now();
  let id = `t-${year}-${n}`;
  while (used.has(id)) {
    n += 1;
    id = `t-${year}-${n}`;
  }
  return id;
}

export interface GroupedCategoryOption {
  group: { id: string; label: string };
  options: { key: string; label: string }[];
}

/** カテゴリ選択UI用: グループごとにまとめ、グループ内はラベルの五十音/字句順にソートする。 */
export function groupedCategoryOptions(categories: CategoriesData): GroupedCategoryOption[] {
  const byGroup = new Map<string, { key: string; label: string }[]>();
  for (const [key, info] of Object.entries(categories.categories)) {
    const list = byGroup.get(info.group) ?? [];
    list.push({ key, label: info.label });
    byGroup.set(info.group, list);
  }

  return categories.groups
    .filter((g) => (byGroup.get(g.id)?.length ?? 0) > 0)
    .map((g) => ({
      group: { id: g.id, label: g.label },
      options: [...(byGroup.get(g.id) ?? [])].sort((a, b) => a.label.localeCompare(b.label, "ja")),
    }));
}

/** 口座フィルタ/選択候補: settings.accounts と実データ中の口座名の和集合（重複なし・昇順）。 */
export function distinctAccounts(transactions: Transaction[], knownAccounts: string[]): string[] {
  const set = new Set<string>(knownAccounts);
  for (const t of transactions) set.add(t.account);
  return [...set].sort((a, b) => a.localeCompare(b, "ja"));
}
