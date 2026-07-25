import type { ApiRequest, ApiResponse } from "./_lib/types.js";
import { requireAuth, AuthError } from "./_lib/auth.js";
import { getAiProvider, AiProviderError } from "./_lib/ai/index.js";
import { ANALYZE_SYSTEM_PROMPT } from "./_lib/prompts.js";

/** docs/api.md の POST /api/analyze リクエストボディ準拠。 */
export interface AnalyzeSummary {
  byGroup: Record<string, number>;
  prevMonth: Record<string, number>;
  budgets: Record<string, number>;
  income: number;
  specialNotes: string[];
  recentMonthsTrend: { month: string; expense: number; income: number }[];
}

interface AnalyzeBody {
  targetMonth?: string;
  summary?: AnalyzeSummary;
}

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "number")
  );
}

function isValidSummary(value: unknown): value is AnalyzeSummary {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    isRecordOfNumbers(s.byGroup) &&
    isRecordOfNumbers(s.prevMonth) &&
    isRecordOfNumbers(s.budgets) &&
    typeof s.income === "number" &&
    Array.isArray(s.specialNotes) &&
    s.specialNotes.every((n) => typeof n === "string") &&
    Array.isArray(s.recentMonthsTrend) &&
    s.recentMonthsTrend.every(
      (t) =>
        typeof t === "object" &&
        t !== null &&
        typeof (t as Record<string, unknown>).month === "string" &&
        typeof (t as Record<string, unknown>).expense === "number" &&
        typeof (t as Record<string, unknown>).income === "number",
    )
  );
}

function buildUserMessage(targetMonth: string, summary: AnalyzeSummary): string {
  return `対象月: ${targetMonth}\n家計データ(JSON):\n${JSON.stringify(summary)}`;
}

function writeSseEvent(
  res: ApiResponse,
  event: string,
  data: unknown,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse,
): Promise<void> {
  try {
    await requireAuth(req.headers.authorization);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "internal_error" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const body = (req.body ?? {}) as AnalyzeBody;
  if (typeof body.targetMonth !== "string" || !isValidSummary(body.summary)) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  let provider;
  try {
    provider = getAiProvider();
  } catch {
    res.status(500).json({ error: "internal_error" });
    return;
  }

  const userMessage = buildUserMessage(body.targetMonth, body.summary);
  const textStream = provider.streamText({
    systemPrompt: ANALYZE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  const iterator = textStream[Symbol.asyncIterator]();

  // 最初のチャンクを先に取得することで、上流呼び出しの初期化エラー
  // (認証・モデル不正など)をSSEを開始する前の通常のHTTPエラーとして返せるようにする。
  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch (err) {
    if (err instanceof AiProviderError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: "upstream_error" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    if (!first.done && first.value) {
      writeSseEvent(res, "delta", { text: first.value });
    }
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      writeSseEvent(res, "delta", { text: next.value });
    }
    writeSseEvent(res, "done", {});
  } catch (err) {
    const code = err instanceof AiProviderError ? err.message : "upstream_error";
    writeSseEvent(res, "error", { error: code });
  } finally {
    res.end();
  }
}
