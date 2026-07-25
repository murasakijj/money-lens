import type { CategoriesData, Transaction } from "../../lib/aggregate";
import { formatDateShort, formatYen } from "../../lib/format";

interface Props {
  transactions: Transaction[];
  categories: CategoriesData;
  onSelect: (id: string) => void;
}

export default function TransactionList({ transactions, categories, onSelect }: Props) {
  if (transactions.length === 0) {
    return <p className="empty-note">該当する明細がありません。</p>;
  }

  return (
    <ul className="transaction-list">
      {transactions.map((t) => {
        const info = categories.categories[t.category];
        const group = info ? categories.groups.find((g) => g.id === info.group) : undefined;
        return (
          <li key={t.id}>
            <button
              type="button"
              className="transaction-row"
              onClick={() => onSelect(t.id)}
            >
              <span className="transaction-date">{formatDateShort(t.date)}</span>
              <span className="transaction-main">
                <span className="transaction-category">
                  <span
                    className="swatch"
                    style={{ backgroundColor: group?.color ?? "#adb5bd" }}
                    aria-hidden="true"
                  />
                  {info?.label ?? t.category}
                  {t.isSpecial && <span className="special-mark" title={t.specialNote ?? "特別出費"}>★</span>}
                </span>
                <span className="transaction-description">{t.description}</span>
              </span>
              <span className={t.amount >= 0 ? "amount-positive" : "amount-negative"}>
                {formatYen(t.amount)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
