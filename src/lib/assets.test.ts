import { describe, it, expect } from "vitest";
import { sortMonthsChrono, upsertMonthMeta } from "./assets";
import type { MonthMeta } from "./aggregate";

function month(overrides: Partial<MonthMeta>): MonthMeta {
  return {
    month: "2025-05",
    isSpecial: false,
    note: null,
    balanceStart: 1000,
    balanceEnd: 1000,
    ...overrides,
  };
}

describe("sortMonthsChrono", () => {
  it("YYYY-MM昇順に並べる", () => {
    const list = [month({ month: "2025-03" }), month({ month: "2025-01" }), month({ month: "2024-12" })];
    expect(sortMonthsChrono(list).map((m) => m.month)).toEqual(["2024-12", "2025-01", "2025-03"]);
  });
});

describe("upsertMonthMeta", () => {
  it("既存の月があれば置き換える", () => {
    const list = [month({ month: "2025-01", balanceEnd: 100 }), month({ month: "2025-02", balanceEnd: 200 })];
    const next = upsertMonthMeta(list, month({ month: "2025-01", balanceEnd: 999 }));
    expect(next).toHaveLength(2);
    expect(next.find((m) => m.month === "2025-01")?.balanceEnd).toBe(999);
  });

  it("存在しない月は追加し、時系列順を保つ", () => {
    const list = [month({ month: "2025-01" }), month({ month: "2025-03" })];
    const next = upsertMonthMeta(list, month({ month: "2025-02" }));
    expect(next.map((m) => m.month)).toEqual(["2025-01", "2025-02", "2025-03"]);
  });
});
