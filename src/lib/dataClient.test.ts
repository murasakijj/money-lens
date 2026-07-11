import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// firebase 初期化を避けるため ./firebase をモックする。
const getIdToken = vi.fn().mockResolvedValue("tok");
vi.mock("./firebase", () => ({
  auth: { currentUser: { getIdToken } as unknown },
}));

const { getData, putData, clearDataCache, ApiError, DataConflictError } =
  await import("./dataClient.js");
const { auth } = await import("./firebase");

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearDataCache();
  (auth as { currentUser: unknown }).currentUser = { getIdToken };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getData", () => {
  it("取得結果をキャッシュし、2回目はfetchしない", async () => {
    const file = { file: "settings.json", sha: "s1", content: { a: 1 } };
    fetchMock.mockResolvedValue(jsonResponse(200, file));

    const first = await getData("settings.json");
    const second = await getData("settings.json");

    expect(first).toEqual(file);
    expect(second).toEqual(file);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("force指定でキャッシュを無視して再取得する", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        file: "settings.json",
        sha: "s1",
        content: { a: 1 },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        file: "settings.json",
        sha: "s2",
        content: { a: 2 },
      }),
    );

    await getData("settings.json");
    const refreshed = await getData("settings.json", { force: true });

    expect(refreshed.sha).toBe("s2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("同時に複数回呼んでも1回だけfetchする(重複排除)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { file: "settings.json", sha: "s1", content: {} }),
    );

    const [a, b] = await Promise.all([
      getData("settings.json"),
      getData("settings.json"),
    ]);

    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("認証トークンをAuthorizationヘッダに付与する", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { file: "settings.json", sha: "s1", content: {} }),
    );
    await getData("settings.json");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/data?file=settings.json");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("エラーレスポンスは ApiError を投げる", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: "forbidden" }));
    await expect(getData("settings.json")).rejects.toBeInstanceOf(ApiError);
    await expect(
      getData("settings.json", { force: true }),
    ).rejects.toMatchObject({ status: 403, message: "forbidden" });
  });

  it("未ログインなら 401 の ApiError", async () => {
    (auth as { currentUser: unknown }).currentUser = null;
    await expect(getData("settings.json")).rejects.toMatchObject({
      status: 401,
      message: "not_authenticated",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("putData", () => {
  it("保存成功後、キャッシュを新しい内容で更新する", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { sha: "s2" }));
    const result = await putData("settings.json", "s1", { a: 2 }, "update");
    expect(result).toEqual({ sha: "s2" });

    // 続く getData はfetchせずキャッシュから新しい内容を返す
    const cached = await getData<{ a: number }>("settings.json");
    expect(cached).toEqual({
      file: "settings.json",
      sha: "s2",
      content: { a: 2 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // PUTの1回のみ
  });

  it("409のときは最新版を再取得し DataConflictError を投げる", async () => {
    // 1回目: PUT が 409
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: "sha_conflict" }),
    );
    // 2回目: force GET で最新版
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        file: "settings.json",
        sha: "server-sha",
        content: { a: 99 },
      }),
    );

    try {
      await putData("settings.json", "stale-sha", { a: 2 }, "update");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DataConflictError);
      const conflict = err as InstanceType<typeof DataConflictError>;
      expect(conflict.status).toBe(409);
      expect(conflict.latest).toEqual({
        file: "settings.json",
        sha: "server-sha",
        content: { a: 99 },
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("409以外のエラーは ApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, { error: "upstream_error" }));
    await expect(
      putData("settings.json", "s1", {}, "update"),
    ).rejects.toMatchObject({ status: 502, message: "upstream_error" });
  });
});

describe("clearDataCache", () => {
  it("キャッシュをクリアすると再度fetchする", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { file: "settings.json", sha: "s1", content: {} }),
    );
    await getData("settings.json");
    clearDataCache();
    await getData("settings.json");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
