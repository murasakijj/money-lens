import { shiftMonth, type CategoriesData } from "../../lib/aggregate";
import type { TransactionFilters } from "../../lib/transactionEdits";
import MonthNav from "../dashboard/MonthNav";

interface Props {
  filters: TransactionFilters;
  categories: CategoriesData;
  accounts: string[];
  onMonthChange: (month: string) => void;
  onChange: (patch: Partial<Omit<TransactionFilters, "month">>) => void;
}

export default function FilterBar({
  filters,
  categories,
  accounts,
  onMonthChange,
  onChange,
}: Props) {
  return (
    <div className="filter-bar">
      <MonthNav
        month={filters.month}
        onPrev={() => onMonthChange(shiftMonth(filters.month, -1))}
        onNext={() => onMonthChange(shiftMonth(filters.month, 1))}
      />
      <div className="filter-row">
        <label className="filter-field">
          <span>グループ</span>
          <select
            value={filters.groupId}
            onChange={(e) => onChange({ groupId: e.target.value })}
          >
            <option value="all">すべて</option>
            {categories.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>口座</span>
          <select
            value={filters.account}
            onChange={(e) => onChange({ account: e.target.value })}
          >
            <option value="all">すべて</option>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field filter-field-keyword">
          <span>キーワード</span>
          <input
            type="text"
            value={filters.keyword}
            onChange={(e) => onChange({ keyword: e.target.value })}
            placeholder="説明・メモ・カテゴリで検索"
          />
        </label>
      </div>
    </div>
  );
}
