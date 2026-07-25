import type { BudgetUsageItem } from "../../lib/aggregate";
import { formatYen } from "../../lib/format";

interface Props {
  items: BudgetUsageItem[];
}

/** グループごとの予算消化率（横棒）。超過は色に加えて「超過」の文字ラベルでも示す。 */
export default function BudgetBars({ items }: Props) {
  if (items.length === 0) {
    return (
      <section className="dashboard-section" aria-label="予算消化率">
        <h3>予算消化率</h3>
        <p className="empty-note">予算が設定されていません。</p>
      </section>
    );
  }

  return (
    <section className="dashboard-section" aria-label="予算消化率">
      <h3>予算消化率</h3>
      <ul className="budget-list">
        {items.map((item) => {
          const pct =
            item.budget > 0
              ? Math.round((item.spent / item.budget) * 100)
              : item.spent > 0
                ? 100
                : 0;
          const width = Math.min(100, pct);
          return (
            <li key={item.groupId} className="budget-row">
              <div className="budget-row-header">
                <span className="budget-row-label">
                  <span
                    className="swatch"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  {item.label}
                </span>
                <span className={item.over ? "amount-negative" : undefined}>
                  {formatYen(item.spent)} / {formatYen(item.budget)}
                  {item.over && "（超過）"}
                </span>
              </div>
              <div
                className="budget-track"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${item.label}の予算消化率`}
              >
                <div
                  className={item.over ? "budget-fill budget-fill-over" : "budget-fill"}
                  style={{
                    width: `${width}%`,
                    backgroundColor: item.over ? "var(--danger)" : item.color,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
