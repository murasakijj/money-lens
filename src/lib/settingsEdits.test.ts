import { describe, it, expect } from "vitest";
import type { BudgetsData, CategoriesData } from "./aggregate";
import {
  addAccount,
  addGroup,
  budgetTextsFromBudgets,
  createGroupId,
  parseBudgetTexts,
  parseSavingsTarget,
  renameAccount,
  updateCategoryGroup,
  updateCategoryLabel,
  updateGroupColor,
} from "./settingsEdits";

function categories(): CategoriesData {
  return {
    groups: [
      { id: "food", label: "食費", color: "#e07a5f" },
      { id: "transport", label: "交通", color: "#3d5a80" },
      { id: "income", label: "収入", color: "#2a9d8f" },
      { id: "excluded", label: "振替（集計除外）", color: "#ced4da" },
    ],
    categories: {
      "Eating Out": { label: "外食", group: "food" },
      Train: { label: "電車", group: "transport" },
    },
  };
}

function budgets(): BudgetsData {
  return {
    monthlyBudgets: { food: 90000, transport: 20000 },
    savingsTarget: 100000,
    note: null,
  };
}

describe("updateCategoryLabel", () => {
  it("指定したカテゴリのラベルを変更する", () => {
    const next = updateCategoryLabel(categories(), "Eating Out", "外食（改）");
    expect(next.categories["Eating Out"]).toEqual({ label: "外食（改）", group: "food" });
  });

  it("存在しないキーは何もしない（同じ内容を返す）", () => {
    const base = categories();
    const next = updateCategoryLabel(base, "Nonexistent", "x");
    expect(next).toEqual(base);
  });

  it("他のカテゴリには影響しない", () => {
    const next = updateCategoryLabel(categories(), "Eating Out", "外食（改）");
    expect(next.categories.Train).toEqual({ label: "電車", group: "transport" });
  });
});

describe("updateCategoryGroup", () => {
  it("指定したカテゴリのグループを変更する", () => {
    const next = updateCategoryGroup(categories(), "Eating Out", "transport");
    expect(next.categories["Eating Out"]).toEqual({ label: "外食", group: "transport" });
  });

  it("存在しないキーは何もしない", () => {
    const base = categories();
    const next = updateCategoryGroup(base, "Nonexistent", "food");
    expect(next).toEqual(base);
  });
});

describe("createGroupId", () => {
  it("group-{既存数+1}を採番する", () => {
    expect(createGroupId(["food", "transport"])).toBe("group-3");
  });

  it("衝突する場合はインクリメントする", () => {
    expect(createGroupId(["group-1", "group-2"])).toBe("group-3");
  });
});

describe("addGroup", () => {
  it("自動採番したIDでグループを追加する", () => {
    const next = addGroup(categories(), "新グループ", "#123456");
    expect(next.groups).toHaveLength(5);
    expect(next.groups[4]).toEqual({ id: "group-5", label: "新グループ", color: "#123456" });
  });

  it("既存のカテゴリマッピングには影響しない", () => {
    const base = categories();
    const next = addGroup(base, "新グループ", "#123456");
    expect(next.categories).toEqual(base.categories);
  });
});

describe("updateGroupColor", () => {
  it("指定したグループの色を変更する", () => {
    const next = updateGroupColor(categories(), "food", "#000000");
    expect(next.groups.find((g) => g.id === "food")?.color).toBe("#000000");
  });

  it("他のグループには影響しない", () => {
    const next = updateGroupColor(categories(), "food", "#000000");
    expect(next.groups.find((g) => g.id === "transport")?.color).toBe("#3d5a80");
  });

  it("存在しないIDは何も変更しない", () => {
    const base = categories();
    const next = updateGroupColor(base, "nonexistent", "#000000");
    expect(next).toEqual(base);
  });
});

describe("budgetTextsFromBudgets", () => {
  it("excluded/incomeを除くグループの予算を文字列化する", () => {
    const texts = budgetTextsFromBudgets(budgets(), categories().groups);
    expect(texts).toEqual({ food: "90000", transport: "20000" });
  });

  it("未設定のグループは空文字にする", () => {
    const emptyBudgets: BudgetsData = { monthlyBudgets: {}, savingsTarget: 0 };
    const texts = budgetTextsFromBudgets(emptyBudgets, categories().groups);
    expect(texts).toEqual({ food: "", transport: "" });
  });
});

describe("parseBudgetTexts", () => {
  it("整数文字列をmonthlyBudgetsに変換する", () => {
    const result = parseBudgetTexts({ food: "90000", transport: "20000" });
    expect(result).toEqual({
      monthlyBudgets: { food: 90000, transport: 20000 },
      invalidGroupIds: [],
    });
  });

  it("空文字はそのグループの予算を未設定にする", () => {
    const result = parseBudgetTexts({ food: "90000", transport: "" });
    expect(result.monthlyBudgets).toEqual({ food: 90000 });
  });

  it("整数でない値はinvalidGroupIdsに積む", () => {
    const result = parseBudgetTexts({ food: "abc", transport: "-5", fixed: "1.5" });
    expect(result.invalidGroupIds.sort()).toEqual(["fixed", "food", "transport"]);
    expect(result.monthlyBudgets).toEqual({});
  });
});

describe("parseSavingsTarget", () => {
  it("整数文字列を数値に変換する", () => {
    expect(parseSavingsTarget("100000")).toBe(100000);
  });

  it("空文字は0を返す", () => {
    expect(parseSavingsTarget("")).toBe(0);
  });

  it("整数でなければnullを返す", () => {
    expect(parseSavingsTarget("abc")).toBeNull();
    expect(parseSavingsTarget("1.5")).toBeNull();
  });
});

describe("addAccount", () => {
  it("新しい口座名を追加する", () => {
    expect(addAccount(["普通"], "エポスゴールドカード")).toEqual(["普通", "エポスゴールドカード"]);
  });

  it("前後の空白を除去する", () => {
    expect(addAccount(["普通"], "  新口座  ")).toEqual(["普通", "新口座"]);
  });

  it("空文字は追加しない（同じ配列を返す）", () => {
    const base = ["普通"];
    expect(addAccount(base, "   ")).toBe(base);
  });

  it("既存と重複する場合は追加しない（同じ配列を返す）", () => {
    const base = ["普通", "エポス"];
    expect(addAccount(base, "普通")).toBe(base);
  });
});

describe("renameAccount", () => {
  it("指定したインデックスの口座名を変更する", () => {
    expect(renameAccount(["普通", "エポス"], 1, "エポスゴールド")).toEqual(["普通", "エポスゴールド"]);
  });

  it("空文字には変更しない（同じ配列を返す）", () => {
    const base = ["普通", "エポス"];
    expect(renameAccount(base, 1, "  ")).toBe(base);
  });

  it("他の口座名と重複する場合は変更しない（同じ配列を返す）", () => {
    const base = ["普通", "エポス"];
    expect(renameAccount(base, 1, "普通")).toBe(base);
  });

  it("自分自身と同じ名前への変更は許可する", () => {
    const base = ["普通", "エポス"];
    expect(renameAccount(base, 1, "エポス")).toEqual(["普通", "エポス"]);
  });
});
