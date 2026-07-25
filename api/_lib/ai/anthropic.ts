import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider } from "./types.js";
import { AiProviderError } from "./types.js";

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

function toAiProviderError(err: unknown): AiProviderError {
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    const code = status === 429 ? "rate_limited" : `anthropic_error_${status ?? "unknown"}`;
    return new AiProviderError(502, code);
  }
  return new AiProviderError(502, "anthropic_error");
}

export const anthropicProvider: AiProvider = {
  async *streamText({ systemPrompt, messages }) {
    const client = getClient();

    // temperature/top_p/top_k は指定しない(claude-sonnet-5では非デフォルト値が400になる)。
    // thinking も未指定(Sonnet 5はデフォルトでadaptive thinking)。
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    try {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    } catch (err) {
      throw toAiProviderError(err);
    }
  },
};
