/** 表示用フォーマッタ（純関数のみ）。 */

/** 3桁区切り + "円"。負値には "-" が自動で付く（Intlの標準動作）。 */
export function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円`;
}

/** "YYYY-MM" を "2025年2月" 形式にする。 */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 3桁区切り + "円"。正値には "+" を付ける（前月比などの差分表示用）。 */
export function formatSignedYen(amount: number): string {
  if (amount > 0) return `+${amount.toLocaleString("ja-JP")}円`;
  return formatYen(amount);
}

/** "YYYY-MM" を "2025/2" のような短い軸ラベルにする（グラフ用）。 */
export function formatMonthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${String(y).slice(2)}/${m}`;
}
