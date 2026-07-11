/**
 * /api/data の file クエリパラメータに許可するパスのみ通す。
 * パストラバーサル(../ 等)や money-lens-data リポジトリ外のパスを拒否する。
 * 対象パスは docs/data-model.md のリポジトリ構成と一致させること。
 */
const ALLOWED_FILES = new Set([
  "salaries.json",
  "months.json",
  "categories.json",
  "budgets.json",
  "life-events.json",
  "settings.json",
]);

const TRANSACTIONS_FILE_PATTERN = /^transactions\/(20\d{2})\.json$/;

export function isAllowedFile(file: string): boolean {
  if (ALLOWED_FILES.has(file)) {
    return true;
  }
  return TRANSACTIONS_FILE_PATTERN.test(file);
}
