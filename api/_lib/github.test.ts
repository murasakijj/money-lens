import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDataFile, putDataFile, GithubApiError } from "./github.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.GITHUB_DATA_REPO = "owner/money-lens-data";
  process.env.GITHUB_TOKEN = "test-token";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDataFile", () => {
  it("base64のcontentをデコードしてJSONを返す", async () => {
    const original = { year: 2025, transactions: [] };
    const encoded = Buffer.from(JSON.stringify(original)).toString("base64");
    fetchMock.mockResolvedValue(
      jsonResponse(200, { sha: "abc", content: encoded }),
    );

    const result = await getDataFile("transactions/2025.json");
    expect(result).toEqual({ sha: "abc", content: original });
  });

  it("認証ヘッダ付きで正しいURLを叩く", async () => {
    const encoded = Buffer.from("{}").toString("base64");
    fetchMock.mockResolvedValue(
      jsonResponse(200, { sha: "abc", content: encoded }),
    );

    await getDataFile("settings.json");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/owner/money-lens-data/contents/settings.json",
    );
    expect(init.headers.Authorization).toBe("Bearer test-token");
  });

  it("404のときは null を返す", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, {}));
    expect(await getDataFile("settings.json")).toBeNull();
  });

  it("その他のエラーは 502 の GithubApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));
    await expect(getDataFile("settings.json")).rejects.toBeInstanceOf(
      GithubApiError,
    );
    await expect(getDataFile("settings.json")).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});

describe("putDataFile", () => {
  it("content を base64 化し、sha 付きで PUT する", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { content: { sha: "newsha" } }),
    );

    const result = await putDataFile(
      "settings.json",
      { a: 1 },
      "update settings.json",
      "oldsha",
    );

    expect(result).toEqual({ sha: "newsha" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PUT");
    const sentBody = JSON.parse(init.body);
    expect(sentBody.sha).toBe("oldsha");
    expect(sentBody.message).toBe("data: update settings.json");
    const decoded = Buffer.from(sentBody.content, "base64").toString("utf-8");
    expect(JSON.parse(decoded)).toEqual({ a: 1 });
  });

  it("新規作成時は sha を送らない", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { content: { sha: "newsha" } }),
    );

    await putDataFile("settings.json", { a: 1 }, "create", null);
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.sha).toBeUndefined();
  });

  it("409/422 は sha_conflict の GithubApiError(409)", async () => {
    for (const status of [409, 422]) {
      fetchMock.mockResolvedValue(jsonResponse(status, {}));
      await expect(
        putDataFile("settings.json", {}, "update", "oldsha"),
      ).rejects.toMatchObject({ statusCode: 409, message: "sha_conflict" });
    }
  });

  it("その他のエラーは 502", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));
    await expect(
      putDataFile("settings.json", {}, "update", "oldsha"),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});
