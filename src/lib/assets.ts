/**
 * /assets（資産推移）のロジック（純関数のみ）。
 *
 * 金額計算はすべて整数（円）で行う。浮動小数は一切使わない。
 * データの読み込み・保存（GitHub経由）はこのファイルでは行わない。
 */

import type { MonthMeta } from "./aggregate";

/** "YYYY-MM" 昇順（時系列順）に並べる。 */
export function sortMonthsChrono(months: MonthMeta[]): MonthMeta[] {
  return [...months].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/**
 * 月末残高入力フォームの保存用。既存の月（同じ month）があれば置き換え、
 * なければ追加してから時系列順に並べ直す（data-model.md: 部分更新はせずファイル全体をPUT）。
 */
export function upsertMonthMeta(months: MonthMeta[], entry: MonthMeta): MonthMeta[] {
  const index = months.findIndex((m) => m.month === entry.month);
  const next = index >= 0 ? months.map((m, i) => (i === index ? entry : m)) : [...months, entry];
  return sortMonthsChrono(next);
}
