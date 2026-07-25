import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GradeChangePoint, SalaryTrendPoint } from "../../lib/salary";
import { formatYen } from "../../lib/format";

interface Props {
  data: SalaryTrendPoint[];
  gradeChanges: GradeChangePoint[];
}

/**
 * 給与推移の折れ線（支給合計/差引支給額）+ 賞与マーカー。
 * 色は dataviz skillの検証済みパレット（palette.md）の slot 1/2/3（blue/orange/aqua）を
 * CSS変数経由で使用（.salary-page 内で light/dark 定義）。
 */
export default function SalaryTrendChart({ data, gradeChanges }: Props) {
  if (data.length === 0) {
    return (
      <section className="dashboard-section" aria-label="給与推移">
        <h3>給与推移</h3>
        <p className="empty-note">給与データがありません。</p>
      </section>
    );
  }

  const labelByMonth = new Map(data.map((p) => [p.month, p.label]));

  return (
    <section className="dashboard-section" aria-label="給与推移">
      <h3>給与推移</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(v: number) => v.toLocaleString("ja-JP")}
            width={64}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(value, name) => [value == null ? "-" : formatYen(Number(value)), name]}
            labelFormatter={(_label, payload) => {
              const row = payload?.[0]?.payload as SalaryTrendPoint | undefined;
              return row ? row.month : "";
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="grossTotal"
            name="支給合計"
            stroke="var(--series-gross)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="netPay"
            name="差引支給額（手取り）"
            stroke="var(--series-net)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          <Scatter dataKey="bonusGrossTotal" name="賞与（支給）" fill="var(--series-bonus)" shape="diamond" />
          {gradeChanges.map((g) => {
            const x = labelByMonth.get(g.month);
            if (x === undefined) return null;
            return (
              <ReferenceLine
                key={g.id}
                x={x}
                stroke="var(--text-muted)"
                strokeDasharray="4 4"
                label={{ value: g.grade, position: "insideTopLeft", fontSize: 11, fill: "var(--text-muted)" }}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="empty-note">◆は賞与（支給合計）のあった月。破線は給与体系（{gradeChanges.map((g) => g.grade).join(" → ")}）の変化点</p>
    </section>
  );
}
