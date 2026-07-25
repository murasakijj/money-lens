import type { MonthDiff, MonthMeta } from "../../lib/aggregate";
import { formatSignedYen, formatYen } from "../../lib/format";

interface Props {
  income: number;
  expense: number;
  net: number;
  savingsTarget: number;
  gap: number;
  diff: MonthDiff | null;
  monthMeta: MonthMeta | undefined;
}

function amountClass(n: number): string {
  return n >= 0 ? "amount-positive" : "amount-negative";
}

export default function SummaryCard({
  income,
  expense,
  net,
  savingsTarget,
  gap,
  diff,
  monthMeta,
}: Props) {
  return (
    <section className="summary-card" aria-label="月次サマリー">
      {monthMeta?.isSpecial && (
        <p className="special-badge">★ {monthMeta.note ?? "特別な月"}</p>
      )}
      <dl className="summary-grid">
        <div className="summary-item">
          <dt>収入</dt>
          <dd className="amount-positive">{formatYen(income)}</dd>
          {diff && <p className="diff-note">前月比 {formatSignedYen(diff.incomeDiff)}</p>}
        </div>
        <div className="summary-item">
          <dt>支出</dt>
          <dd className="amount-negative">{formatYen(expense)}</dd>
          {diff && <p className="diff-note">前月比 {formatSignedYen(diff.expenseDiff)}</p>}
        </div>
        <div className="summary-item">
          <dt>収支差</dt>
          <dd className={amountClass(net)}>{formatYen(net)}</dd>
          {diff && <p className="diff-note">前月比 {formatSignedYen(diff.netDiff)}</p>}
        </div>
        <div className="summary-item">
          <dt>貯金目標との差</dt>
          <dd className={amountClass(gap)}>{formatYen(gap)}</dd>
          <p className="diff-note">目標 {formatYen(savingsTarget)}</p>
        </div>
      </dl>
    </section>
  );
}
