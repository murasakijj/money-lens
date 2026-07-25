import { describe, it, expect } from "vitest";
import {
  createSalaryId,
  deductionBreakdown,
  deductionTrend,
  gradeChangePoints,
  insertSalarySorted,
  salaryMonth,
  salaryTrend,
  sortSalariesChrono,
  type SalaryEntry,
} from "./salary";

function salary(overrides: Partial<SalaryEntry>): SalaryEntry {
  return {
    id: "s-2021-11",
    year: 2021,
    month: 11,
    type: "給与",
    grade: "ML10",
    grossTotal: 443334,
    deductionTotal: 48210,
    netPay: 395124,
    payments: {
      基本給: 433334,
      住宅手当: 10000,
      前払退職金: null,
      時間外勤務手当: null,
      深夜手当: null,
      賞与基本給: null,
      特別支給: null,
      その他支給: null,
      基本給調整: null,
    },
    deductions: {
      健康保険: null,
      厚生年金: null,
      雇用保険: 1330,
      社会保険料合計: 1330,
      所得税: 20180,
      住民税: 26700,
      年調過不足額: null,
      その他控除額: null,
      株式購入: null,
      レインバース: null,
    },
    attendance: {
      所定勤務日数: 30,
      勤務日数: 30,
      欠勤日数: 0,
      時間外勤務時間: 0,
      深夜時間: 0,
      休日時間: 0,
      精算残業時間: 0,
      "60時間超": null,
    },
    bankTransfer: 395124,
    taxableAmount: null,
    note: null,
    ...overrides,
  };
}

describe("sortSalariesChrono / salaryMonth", () => {
  it("year, month, type(給与→賞与)の順で並べる", () => {
    const list: SalaryEntry[] = [
      salary({ id: "b", year: 2022, month: 8, type: "賞与" }),
      salary({ id: "a", year: 2022, month: 8, type: "給与" }),
      salary({ id: "c", year: 2021, month: 12, type: "給与" }),
      salary({ id: "d", year: 2022, month: 1, type: "給与" }),
    ];
    const sorted = sortSalariesChrono(list);
    expect(sorted.map((s) => s.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("salaryMonthはYYYY-MM形式（0埋め）を返す", () => {
    expect(salaryMonth(salary({ year: 2021, month: 11 }))).toBe("2021-11");
    expect(salaryMonth(salary({ year: 2022, month: 1 }))).toBe("2022-01");
  });
});

describe("salaryTrend", () => {
  it("同じ月の給与と賞与を1行にまとめる", () => {
    const list: SalaryEntry[] = [
      salary({ id: "s-2022-08", year: 2022, month: 8, type: "給与", grossTotal: 564789, netPay: 445865, grade: "ML10" }),
      salary({ id: "s-2022-08-bonus", year: 2022, month: 8, type: "賞与", grossTotal: 12952, netPay: 9535 }),
    ];
    const trend = salaryTrend(list);
    expect(trend).toHaveLength(1);
    expect(trend[0]).toMatchObject({
      month: "2022-08",
      label: "22/8",
      grossTotal: 564789,
      netPay: 445865,
      bonusGrossTotal: 12952,
      bonusNetPay: 9535,
      grade: "ML10",
    });
  });

  it("給与のみの月は賞与フィールドがnullのまま", () => {
    const trend = salaryTrend([salary({ id: "a", year: 2021, month: 11 })]);
    expect(trend[0].bonusGrossTotal).toBeNull();
    expect(trend[0].bonusNetPay).toBeNull();
  });

  it("時系列順に並ぶ", () => {
    const list: SalaryEntry[] = [
      salary({ id: "b", year: 2022, month: 1 }),
      salary({ id: "a", year: 2021, month: 11 }),
    ];
    const trend = salaryTrend(list);
    expect(trend.map((t) => t.month)).toEqual(["2021-11", "2022-01"]);
  });
});

describe("deductionBreakdown / deductionTrend", () => {
  it("社会保険/所得税/住民税/その他に分解する", () => {
    const entry = salary({
      deductionTotal: 48210,
      deductions: {
        健康保険: null,
        厚生年金: null,
        雇用保険: 1330,
        社会保険料合計: 1330,
        所得税: 20180,
        住民税: 26700,
        年調過不足額: null,
        その他控除額: null,
        株式購入: null,
        レインバース: null,
      },
    });
    const b = deductionBreakdown(entry);
    expect(b).toMatchObject({
      social: 1330,
      incomeTax: 20180,
      residentTax: 26700,
      other: 0,
      total: 48210,
    });
  });

  it("deductionTotalが既知3項目の合計より大きければ差分をその他に計上する", () => {
    const entry = salary({
      deductionTotal: 112245,
      deductions: {
        健康保険: 28000,
        厚生年金: 73200,
        雇用保険: 4800,
        社会保険料合計: 10600,
        所得税: 30000,
        住民税: null,
        年調過不足額: null,
        その他控除額: null,
        株式購入: 71645,
        レインバース: null,
      },
    });
    const b = deductionBreakdown(entry);
    // known = social(10600) + incomeTax(30000) + residentTax(0) = 40600
    // other = 112245 - 40600 = 71645
    expect(b.social).toBe(10600);
    expect(b.incomeTax).toBe(30000);
    expect(b.residentTax).toBe(0);
    expect(b.other).toBe(71645);
    expect(b.total).toBe(112245);
  });

  it("deductionTotalがnullの場合は既知3項目の合計を使い、その他は0にする", () => {
    const entry = salary({
      deductionTotal: null,
      deductions: {
        健康保険: 28000,
        厚生年金: 73200,
        雇用保険: 4800,
        社会保険料合計: 10600,
        所得税: 127543,
        住民税: null,
        年調過不足額: null,
        その他控除額: null,
        株式購入: 80000,
        レインバース: null,
      },
    });
    const b = deductionBreakdown(entry);
    expect(b.social).toBe(10600);
    expect(b.incomeTax).toBe(127543);
    expect(b.residentTax).toBe(0);
    expect(b.total).toBe(10600 + 127543);
    expect(b.other).toBe(0);
  });

  it("otherが負になる場合は0に丸める（既知3項目がtotalを超えるケース）", () => {
    const entry = salary({
      deductionTotal: 10,
      deductions: {
        健康保険: null,
        厚生年金: null,
        雇用保険: null,
        社会保険料合計: 100,
        所得税: 0,
        住民税: 0,
        年調過不足額: null,
        その他控除額: null,
        株式購入: null,
        レインバース: null,
      },
    });
    expect(deductionBreakdown(entry).other).toBe(0);
  });

  it("deductionTrendは時系列順に並ぶ", () => {
    const list: SalaryEntry[] = [
      salary({ id: "b", year: 2022, month: 1 }),
      salary({ id: "a", year: 2021, month: 11 }),
    ];
    expect(deductionTrend(list).map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("gradeChangePoints", () => {
  it("先頭と、その後gradeが変化した最初のエントリを返す", () => {
    const list: SalaryEntry[] = [
      salary({ id: "1", year: 2021, month: 11, grade: "ML10" }),
      salary({ id: "2", year: 2021, month: 12, grade: "ML10" }),
      salary({ id: "3", year: 2022, month: 1, grade: "ML10" }),
      salary({ id: "4", year: 2022, month: 12, grade: "ML9" }),
      salary({ id: "5", year: 2023, month: 1, grade: "ML9" }),
      salary({ id: "6", year: 2023, month: 12, grade: "ML8" }),
    ];
    const points = gradeChangePoints(list);
    expect(points.map((p) => ({ id: p.id, grade: p.grade }))).toEqual([
      { id: "1", grade: "ML10" },
      { id: "4", grade: "ML9" },
      { id: "6", grade: "ML8" },
    ]);
  });

  it("賞与エントリは無視する（給与のみで判定）", () => {
    const list: SalaryEntry[] = [
      salary({ id: "1", year: 2022, month: 8, type: "給与", grade: "ML10" }),
      salary({ id: "2", year: 2022, month: 8, type: "賞与", grade: "ML10" }),
      salary({ id: "3", year: 2022, month: 9, type: "給与", grade: "ML10" }),
    ];
    expect(gradeChangePoints(list)).toHaveLength(1);
  });
});

describe("createSalaryId", () => {
  it("給与は s-{year}-{month2桁}", () => {
    expect(createSalaryId(2026, 2, "給与", [])).toBe("s-2026-02");
  });

  it("賞与は末尾に -bonus", () => {
    expect(createSalaryId(2026, 12, "賞与", [])).toBe("s-2026-12-bonus");
  });

  it("既存IDと衝突する場合は連番を付与する", () => {
    const existing = ["s-2026-02", "s-2026-02-2"];
    expect(createSalaryId(2026, 2, "給与", existing)).toBe("s-2026-02-3");
  });
});

describe("insertSalarySorted", () => {
  it("挿入後も時系列順を保つ", () => {
    const list: SalaryEntry[] = [
      salary({ id: "a", year: 2021, month: 11 }),
      salary({ id: "c", year: 2022, month: 1 }),
    ];
    const inserted = insertSalarySorted(list, salary({ id: "b", year: 2021, month: 12 }));
    expect(inserted.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});
