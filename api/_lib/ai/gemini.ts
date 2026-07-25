import { GoogleGenAI, ApiError as GenAiApiError } from "@google/genai";
import type { AiMessage, AiProvider } from "./types.js";
import { AiProviderError } from "./types.js";

/** 無料枠の対象モデル。GEMINI_MODEL 環境変数で上書き可能。 */
const DEFAULT_MODEL = "gemini-2.5-flash";

function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
}

function toContents(messages: AiMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));
}

function toAiProviderError(err: unknown): AiProviderError {
  if (err instanceof GenAiApiError) {
    const code = err.status === 429 ? "rate_limited" : `gemini_error_${err.status}`;
    return new AiProviderError(502, code);
  }
  return new AiProviderError(502, "gemini_error");
}

export const geminiProvider: AiProvider = {
  async *streamText({ systemPrompt, messages }) {
    const client = getClient();

    let stream;
    try {
      stream = await client.models.generateContentStream({
        model: getModel(),
        config: { systemInstruction: systemPrompt },
        contents: toContents(messages),
      });
    } catch (err) {
      throw toAiProviderError(err);
    }

    try {
      for await (const chunk of stream) {
        if (chunk.text) yield chunk.text;
      }
    } catch (err) {
      throw toAiProviderError(err);
    }
  },
};
