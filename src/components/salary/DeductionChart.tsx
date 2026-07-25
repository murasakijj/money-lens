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
import type { DeductionBreakdown } from "../../lib/salary";
import { formatYen } from "../../lib/format";

interface Props {
  data: DeductionBreakdown[];
}

interface ChartRow {
  id: string;
  label: string;
  social: number;
  incomeTax: number;
  residentTax: number;
  other: number;
}

function shortLabel(month: string, type: DeductionBreakdown["type"]): string {
  const [y, m] = month.split("-").map(Number);
  const suffix = type === "賞与" ? "賞" : "";
  return `${String(y).slice(2)}/${m}${suffix}`;
}

/** 控除内訳（社会保険/所得税/住民税/その他）の積み上げ棒グラフ。 */
export default function DeductionChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <section className="dashboard-section" aria-label="控除内訳">
        <h3>控除内訳</h3>
        <p className="empty-note">給与データがありません。</p>
      </section>
    );
  }

  const rows: ChartRow[] = data.map((d) => ({
    id: d.id,
    label: shortLabel(d.month, d.type),
    social: d.social,
    incomeTax: d.incomeTax,
    residentTax: d.residentTax,
    other: d.other,
  }));

  return (
    <section className="dashboard-section" aria-label="控除内訳">
      <h3>控除内訳</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis
            tickFormatter={(v: number) => v.toLocaleString("ja-JP")}
            width={64}
            tick={{ fontSize: 11 }}
          />
          <Tooltip formatter={(value, name) => [formatYen(Number(value)), name]} />
          <Legend />
          <Bar dataKey="social" name="社会保険" stackId="deduction" fill="var(--series-social)" />
          <Bar dataKey="incomeTax" name="所得税" stackId="deduction" fill="var(--series-income-tax)" />
          <Bar dataKey="residentTax" name="住民税" stackId="deduction" fill="var(--series-resident-tax)" />
          <Bar
            dataKey="other"
            name="その他"
            stackId="deduction"
            fill="var(--series-other)"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
