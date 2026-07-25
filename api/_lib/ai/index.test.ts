import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getAiProvider } from "./index.js";
import { geminiProvider } from "./gemini.js";
import { anthropicProvider } from "./anthropic.js";

const originalAiProvider = process.env.AI_PROVIDER;

beforeEach(() => {
  delete process.env.AI_PROVIDER;
});

afterEach(() => {
  if (originalAiProvider === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = originalAiProvider;
  }
});

describe("getAiProvider", () => {
  it("AI_PROVIDER未設定ならGeminiをデフォルトで返す", () => {
    delete process.env.AI_PROVIDER;
    expect(getAiProvider()).toBe(geminiProvider);
  });

  it('AI_PROVIDER="gemini"ならGeminiを返す', () => {
    process.env.AI_PROVIDER = "gemini";
    expect(getAiProvider()).toBe(geminiProvider);
  });

  it('AI_PROVIDER="anthropic"ならAnthropicを返す', () => {
    process.env.AI_PROVIDER = "anthropic";
    expect(getAiProvider()).toBe(anthropicProvider);
  });

  it("大文字小文字・前後空白を無視する", () => {
    process.env.AI_PROVIDER = "  Anthropic  ";
    expect(getAiProvider()).toBe(anthropicProvider);
  });

  it("未知の値はエラーを投げる", () => {
    process.env.AI_PROVIDER = "openai";
    expect(() => getAiProvider()).toThrow("Unknown AI_PROVIDER");
  });
});
