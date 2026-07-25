import type { AiProvider } from "./types.js";
import { geminiProvider } from "./gemini.js";
import { anthropicProvider } from "./anthropic.js";

/**
 * 環境変数 AI_PROVIDER("gemini" | "anthropic"、デフォルト "gemini") を見て
 * 実装を選択する。api/analyze.ts / api/chat.ts はこの関数の戻り値
 * (AiProvider) のみに依存し、具体的なプロバイダを意識しない。
 */
export function getAiProvider(): AiProvider {
  const raw = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  const provider = raw === "" ? "gemini" : raw;

  if (provider === "gemini") return geminiProvider;
  if (provider === "anthropic") return anthropicProvider;

  throw new Error(`Unknown AI_PROVIDER: ${raw}`);
}

export type { AiMessage, AiProvider } from "./types.js";
export { AiProviderError } from "./types.js";
