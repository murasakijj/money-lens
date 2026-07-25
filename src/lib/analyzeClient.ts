import { auth } from "./firebase";
import { ApiError } from "./dataClient";

export interface SseEvent {
  event: string;
  data: string;
}

/**
 * SSEの生テキストをイベント単位に分割する純関数。
 * `\n\n` 区切りごとに1イベント。末尾の未完成分は rest として返し、
 * 次のチャンクと連結して再度渡す想定。
 */
export function parseSseChunk(buffer: string): {
  events: SseEvent[];
  rest: string;
} {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: SseEvent[] = [];

  for (const part of parts) {
    if (!part.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
    events.push({ event, data: dataLines.join("\n") });
  }

  return { events, rest };
}

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError(401, "not_authenticated");
  }
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/**
 * POST /api/analyze を呼び、テキストの差分を逐次yieldする。
 * "done" イベントで正常終了。"error" イベント受信時、またはHTTPが
 * エラーの場合は ApiError を投げる。
 */
export async function* streamAnalysis(
  targetMonth: string,
  summary: unknown,
): AsyncGenerator<string> {
  const headers = await authHeader();
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ targetMonth, summary }),
  });

  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiError(res.status, body?.error ?? "unknown_error");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const { events, rest } = parseSseChunk(buffer);
    buffer = rest;

    for (const evt of events) {
      if (evt.event === "delta") {
        const parsed = JSON.parse(evt.data) as { text?: string };
        if (parsed.text) yield parsed.text;
      } else if (evt.event === "done") {
        return;
      } else if (evt.event === "error") {
        const parsed = JSON.parse(evt.data) as { error?: string };
        throw new ApiError(502, parsed.error ?? "upstream_error");
      }
    }
  }
}
