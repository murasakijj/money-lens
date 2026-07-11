import { describe, it, expect } from "vitest";
import { isAllowedFile } from "./fileAllowlist.js";

describe("isAllowedFile", () => {
  it("固定の許可ファイルを通す", () => {
    for (const file of [
      "salaries.json",
      "months.json",
      "categories.json",
      "budgets.json",
      "life-events.json",
      "settings.json",
    ]) {
      expect(isAllowedFile(file)).toBe(true);
    }
  });

  it("transactions/{年}.json を通す", () => {
    expect(isAllowedFile("transactions/2025.json")).toBe(true);
    expect(isAllowedFile("transactions/2026.json")).toBe(true);
    expect(isAllowedFile("transactions/2099.json")).toBe(true);
  });

  it("年の範囲外・桁数違いは拒否する", () => {
    expect(isAllowedFile("transactions/1999.json")).toBe(false);
    expect(isAllowedFile("transactions/999.json")).toBe(false);
    expect(isAllowedFile("transactions/20250.json")).toBe(false);
    expect(isAllowedFile("transactions/2025-01.json")).toBe(false);
  });

  it("パストラバーサルを拒否する", () => {
    expect(isAllowedFile("../secret.json")).toBe(false);
    expect(isAllowedFile("../../etc/passwd")).toBe(false);
    expect(isAllowedFile("transactions/../settings.json")).toBe(false);
    expect(isAllowedFile("transactions/../../.env")).toBe(false);
  });

  it("許可リスト外のパス・拡張子を拒否する", () => {
    expect(isAllowedFile("secrets.json")).toBe(false);
    expect(isAllowedFile("settings.js")).toBe(false);
    expect(isAllowedFile("SETTINGS.JSON")).toBe(false);
    expect(isAllowedFile("data/settings.json")).toBe(false);
    expect(isAllowedFile("transactions/2025.JSON")).toBe(false);
    expect(isAllowedFile("transactions/all.json")).toBe(false);
  });

  it("空文字・スラッシュのみを拒否する", () => {
    expect(isAllowedFile("")).toBe(false);
    expect(isAllowedFile("/")).toBe(false);
    expect(isAllowedFile("/settings.json")).toBe(false);
  });
});
