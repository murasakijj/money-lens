import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "../../lib/aggregate";
import { formatMonthShort, formatYen } from "../../lib/format";

interface Props {
  data: TrendPoint[];
  excludeSpecial: boolean;
  onToggleExcludeSpecial: (value: boolean) => void;
}

// 収入=緑系 / 支出=赤系（CVD検証済み: dataviz skillのvalidate_palette.jsでlight/dark両方PASS）。
const INCOME_COLOR = "#2a9d8f";
const EXPENSE_COLOR = "#bb4430";

interface ChartRow {
  month: string;
  label: string;
  income: number;
  expenseAbs: number;
  note: string | null;
}

export default function TrendChart({
  data,
  excludeSpecial,
  onToggleExcludeSpecial,
}: Props) {
  const rows: ChartRow[] = data.map((p) => ({
    month: p.month,
    label: formatMonthShort(p.month) + (p.isSpecial ? " ★" : ""),
    income: p.income,
    expenseAbs: -p.expense,
    note: p.note,
  }));

  return (
    <section className="dashboard-section" aria-label="月次推移">
      <div className="trend-header">
        <h3>月次推移（直近12ヶ月）</h3>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={excludeSpecial}
            onChange={(e) => onToggleExcludeSpecial(e.target.checked)}
          />
          特別出費を除いた支出
        </label>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} barGap={2} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(v: number) => v.toLocaleString("ja-JP")}
            width={60}
            tick={{ fontSize: 11 }}
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
          <Bar
            dataKey="income"
            name="収入"
            fill={INCOME_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={20}
          />
          <Bar
            dataKey="expenseAbs"
            name="支出"
            fill={EXPENSE_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
      <p className="empty-note">★は特別出費のあった月</p>
    </section>
  );
}
