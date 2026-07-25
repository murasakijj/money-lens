/**
 * /salary（給与推移）のロジック（純関数のみ）。
 *
 * 金額計算はすべて整数（円）で行う。浮動小数は一切使わない。
 * データの読み込み・保存（GitHub経由）はこのファイルでは行わない。
 */

import { formatMonthShort } from "./format";

export interface SalaryPayments {
  基本給: number | null;
  住宅手当: number | null;
  前払退職金: number | null;
  時間外勤務手当: number | null;
  深夜手当: number | null;
  賞与基本給: number | null;
  特別支給: number | null;
  その他支給: number | null;
  基本給調整: number | null;
}

export interface SalaryDeductions {
  健康保険: number | null;
  厚生年金: number | null;
  雇用保険: number | null;
  社会保険料合計: number | null;
  所得税: number | null;
  住民税: number | null;
  年調過不足額: number | null;
  その他控除額: number | null;
  株式購入: number | null;
  レインバース: number | null;
}

export interface SalaryAttendance {
  所定勤務日数: number | null;
  勤務日数: number | null;
  欠勤日数: number | null;
  時間外勤務時間: number | null;
  深夜時間: number | null;
  休日時間: number | null;
  精算残業時間: number | null;
  "60時間超": number | null;
}

export type SalaryType = "給与" | "賞与";

export interface SalaryEntry {
  id: string;
  year: number;
  month: number; // 1-12
  type: SalaryType;
  grade: string;
  grossTotal: number | null;
  deductionTotal: number | null;
  netPay: number | null;
  payments: SalaryPayments;
  deductions: SalaryDeductions;
  attendance: SalaryAttendance;
  bankTransfer: number | null;
  taxableAmount: number | null;
  note: string | null;
}

const TYPE_ORDER: Record<SalaryType, number> = { 給与: 0, 賞与: 1 };

/** year, month, type（給与→賞与）の順で時系列に並べる。 */
export function sortSalariesChrono(salaries: SalaryEntry[]): SalaryEntry[] {
  return [...salaries].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  });
}

/** "YYYY-MM" 形式の月キー。 */
export function salaryMonth(entry: SalaryEntry): string {
  return `${entry.year}-${String(entry.month).padStart(2, "0")}`;
}

export interface SalaryTrendPoint {
  month: string; // "YYYY-MM"
  label: string; // "21/11" のような短い軸ラベル
  grossTotal: number | null; // 給与の支給合計（その月に給与エントリがなければ null）
  netPay: number | null; // 給与の差引支給額
  bonusGrossTotal: number | null; // 賞与の支給合計（その月に賞与がなければ null）
  bonusNetPay: number | null; // 賞与の差引支給額
  grade: string | null; // その月の給与体系（給与エントリ基準）
}

/**
 * 給与推移グラフ用のデータ。月ごとに1行にまとめ、給与（支給合計/手取り）と
 * 賞与（支給合計/手取り）を別フィールドに分ける（賞与は別系列/マーカー表示用）。
 * 同じ月に給与・賞与の両方があるケース（Excel実績あり）に対応する。
 */
export function salaryTrend(salaries: SalaryEntry[]): SalaryTrendPoint[] {
  const sorted = sortSalariesChrono(salaries);
  const byMonth = new Map<string, SalaryTrendPoint>();
  const order: string[] = [];

  for (const entry of sorted) {
    const month = salaryMonth(entry);
    let point = byMonth.get(month);
    if (!point) {
      point = {
        month,
        label: formatMonthShort(month),
        grossTotal: null,
        netPay: null,
        bonusGrossTotal: null,
        bonusNetPay: null,
        grade: null,
      };
      byMonth.set(month, point);
      order.push(month);
    }
    if (entry.type === "給与") {
      point.grossTotal = entry.grossTotal;
      point.netPay = entry.netPay;
      point.grade = entry.grade;
    } else {
      point.bonusGrossTotal = entry.grossTotal;
      point.bonusNetPay = entry.netPay;
    }
  }

  return order.map((m) => byMonth.get(m)!);
}

export interface DeductionBreakdown {
  id: string;
  month: string;
  type: SalaryType;
  social: number; // 社会保険
  incomeTax: number; // 所得税
  residentTax: number; // 住民税
  other: number; // その他（deductionTotalから既知3項目を差し引いた残り。負にはしない）
  total: number;
}

/**
 * 控除内訳（社会保険/所得税/住民税/その他）。積み上げ棒グラフ用。
 * 「その他」は deductionTotal から既知3項目を差し引いた残り
 * （年調過不足額・その他控除額・株式購入・レインバース等をまとめて扱う）。
 * deductionTotal が null の場合は既知3項目の合計を使う（その他は0）。
 */
export function deductionBreakdown(entry: SalaryEntry): DeductionBreakdown {
  const social = entry.deductions.社会保険料合計 ?? 0;
  const incomeTax = entry.deductions.所得税 ?? 0;
  const residentTax = entry.deductions.住民税 ?? 0;
  const knownTotal = social + incomeTax + residentTax;
  const total = entry.deductionTotal ?? knownTotal;
  const other = Math.max(0, total - knownTotal);
  return {
    id: entry.id,
    month: salaryMonth(entry),
    type: entry.type,
    social,
    incomeTax,
    residentTax,
    other,
    total,
  };
}

/** salaries全体の控除内訳（時系列順）。 */
export function deductionTrend(salaries: SalaryEntry[]): DeductionBreakdown[] {
  return sortSalariesChrono(salaries).map(deductionBreakdown);
}

export interface GradeChangePoint {
  id: string;
  month: string;
  grade: string;
}

/**
 * 給与体系（grade）の変化点。時系列で並べた「給与」タイプのエントリのうち、
 * 直前と grade が異なる最初の1件ずつを返す（先頭は常に含む＝起点の給与体系）。
 */
export function gradeChangePoints(salaries: SalaryEntry[]): GradeChangePoint[] {
  const salaryOnly = sortSalariesChrono(salaries).filter((s) => s.type === "給与");
  const points: GradeChangePoint[] = [];
  let prevGrade: string | null = null;
  for (const entry of salaryOnly) {
    if (entry.grade !== prevGrade) {
      points.push({ id: entry.id, month: salaryMonth(entry), grade: entry.grade });
      prevGrade = entry.grade;
    }
  }
  return points;
}

/**
 * 手動追加用のID採番。給与は `s-{year}-{month2桁}`、賞与は末尾に `-bonus`
 * （data-model.md準拠）。既存IDと衝突する場合は連番を付与する。
 */
export function createSalaryId(
  year: number,
  month: number,
  type: SalaryType,
  existingIds: Iterable<string>,
): string {
  const used = new Set(existingIds);
  const base = `s-${year}-${String(month).padStart(2, "0")}${type === "賞与" ? "-bonus" : ""}`;
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** 追加後も時系列順を保って挿入する（保存用）。 */
export function insertSalarySorted(
  salaries: SalaryEntry[],
  entry: SalaryEntry,
): SalaryEntry[] {
  return sortSalariesChrono([...salaries, entry]);
}
