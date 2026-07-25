import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthMeta } from "../../lib/aggregate";
import { formatYen } from "../../lib/format";

interface Props {
  data: MonthMeta[];
}

interface ChartRow {
  month: string;
  label: string;
  balanceStart: number;
  balanceEnd: number;
  isSpecial: boolean;
  note: string | null;
}

function shortLabel(month: string, isSpecial: boolean): string {
  const [y, m] = month.split("-").map(Number);
  return `${String(y).slice(2)}/${m}${isSpecial ? " ★" : ""}`;
}

/** ★特別出費月は大きめのマーカーで強調する。 */
function SpecialAwareDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
  color: string;
}) {
  const { cx, cy, payload, color } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  if (!payload.isSpecial) {
    return <circle cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={6}
      fill="var(--surface)"
      stroke={color}
      strokeWidth={2}
    />
  );
}

/** 口座残高推移（折れ線）。★特別出費月は大きめのマーカーで強調し、注記をツールチップに表示する。 */
export default function BalanceTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <section className="dashboard-section" aria-label="資産推移">
        <h3>資産推移</h3>
        <p className="empty-note">残高データがありません。</p>
      </section>
    );
  }

  const rows: ChartRow[] = data.map((m) => ({
    month: m.month,
    label: shortLabel(m.month, m.isSpecial),
    balanceStart: m.balanceStart,
    balanceEnd: m.balanceEnd,
    isSpecial: m.isSpecial,
    note: m.note,
  }));

  return (
    <section className="dashboard-section" aria-label="資産推移">
      <h3>資産推移</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(v: number) => v.toLocaleString("ja-JP")}
            width={72}
            tick={{ fontSize: 11 }}
            domain={["auto", "auto"]}
          />
          <Tooltip
            formatter={(value, name) => [formatYen(Number(value)), name]}
            labelFormatter={(_label, payload) => {
              const row = payload?.[0]?.payload as ChartRow | undefined;
              if (!row) return "";
              return row.note ? `${row.month}（${row.note}）` : row.month;
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="balanceStart"
            name="月初残高"
            stroke="var(--series-balance-start)"
            strokeWidth={2}
            dot={({ cx, cy, payload }) => (
              <SpecialAwareDot
                key={`start-${payload?.month}`}
                cx={cx}
                cy={cy}
                payload={payload as ChartRow | undefined}
                color="var(--series-balance-start)"
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="balanceEnd"
            name="月末残高"
            stroke="var(--series-balance-end)"
            strokeWidth={2}
            dot={({ cx, cy, payload }) => (
              <SpecialAwareDot
                key={`end-${payload?.month}`}
                cx={cx}
                cy={cy}
                payload={payload as ChartRow | undefined}
                color="var(--series-balance-end)"
              />
            )}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="empty-note">★は特別出費のあった月（ツールチップに内容を表示）</p>
    </section>
  );
}
