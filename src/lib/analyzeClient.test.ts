import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getIdToken = vi.fn().mockResolvedValue("tok");
vi.mock("./firebase", () => ({
  auth: { currentUser: { getIdToken } as unknown },
}));

const { parseSseChunk, streamAnalysis } = await import("./analyzeClient.js");
const { auth } = await import("./firebase");
const { ApiError } = await import("./dataClient.js");

describe("parseSseChunk", () => {
  it("完全なイベントを分割し、未完成分をrestに残す", () => {
    const { events, rest } = parseSseChunk(
      'event: delta\ndata: {"text":"a"}\n\nevent: delta\ndata: {"text":"b"}\n\nevent: don',
    );
    expect(events).toEqual([
      { event: "delta", data: '{"text":"a"}' },
      { event: "delta", data: '{"text":"b"}' },
    ]);
    expect(rest).toBe("event: don");
  });

  it("空チャンクではイベントを返さない", () => {
    expect(parseSseChunk("")).toEqual({ events: [], rest: "" });
  });
});

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i += 1;
      } else {
        controller.close();
      }
    },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  (auth as { currentUser: unknown }).currentUser = { getIdToken };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

describe("streamAnalysis", () => {
  it("deltaイベントを逐次yieldし、doneで終了する", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: sseStream([
        'event: delta\ndata: {"text":"事実: "}\n\n',
        'event: delta\ndata: {"text":"支出は..."}\n\n',
        "event: done\ndata: {}\n\n",
      ]),
    });

    const result = await collect(streamAnalysis("2026-06", { income: 0 }));
    expect(result).toEqual(["事実: ", "支出は..."]);
  });

  it("認証ヘッダを付与しリクエストボディを組み立てる", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: sseStream(["event: done\ndata: {}\n\n"]),
    });

    await collect(streamAnalysis("2026-06", { income: 123 }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/analyze");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({
      targetMonth: "2026-06",
      summary: { income: 123 },
    });
  });

  it("errorイベント受信時はApiErrorを投げる", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: sseStream(['event: error\ndata: {"error":"rate_limited"}\n\n']),
    });

    await expect(collect(streamAnalysis("2026-06", {}))).rejects.toMatchObject(
      { status: 502, message: "rate_limited" },
    );
  });

  it("HTTPエラー応答はApiErrorを投げる", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "forbidden" }),
    });

    await expect(collect(streamAnalysis("2026-06", {}))).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(
      collect(streamAnalysis("2026-06", {})),
    ).rejects.toMatchObject({ status: 403, message: "forbidden" });
  });

  it("未ログインなら401のApiError", async () => {
    (auth as { currentUser: unknown }).currentUser = null;
    await expect(
      collect(streamAnalysis("2026-06", {})),
    ).rejects.toMatchObject({ status: 401, message: "not_authenticated" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
