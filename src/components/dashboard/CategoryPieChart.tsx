import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { GroupAmount } from "../../lib/aggregate";
import { formatYen } from "../../lib/format";

interface Props {
  data: GroupAmount[];
}

/**
 * カテゴリグループ別支出の円グラフ。
 * categories.json のグループ数は10前後になり得るため、色の識別だけに頼らず
 * 隣接するテキストの凡例（ラベル・金額・割合）を必ず併記する。
 */
export default function CategoryPieChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <section className="dashboard-section" aria-label="カテゴリ別支出">
        <h3>カテゴリ別支出</h3>
        <p className="empty-note">この月の支出データがありません。</p>
      </section>
    );
  }

  const total = data.reduce((sum, g) => sum + g.amount, 0);

  return (
    <section className="dashboard-section" aria-label="カテゴリ別支出">
      <h3>カテゴリ別支出</h3>
      <div className="pie-layout">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="label"
              innerRadius={48}
              outerRadius={88}
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {data.map((g) => (
                <Cell key={g.groupId} fill={g.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [formatYen(Number(value)), name]} />
          </PieChart>
        </ResponsiveContainer>
        <ul className="pie-legend">
          {data.map((g) => (
            <li key={g.groupId}>
              <span
                className="swatch"
                style={{ backgroundColor: g.color }}
                aria-hidden="true"
              />
              <span className="legend-label">{g.label}</span>
              <span className="legend-amount">{formatYen(g.amount)}</span>
              <span className="legend-pct">
                {total > 0 ? Math.round((g.amount / total) * 100) : 0}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
