const GITHUB_API = "https://api.github.com";

function getRepo(): string {
  const repo = process.env.GITHUB_DATA_REPO;
  if (!repo) {
    throw new Error("GITHUB_DATA_REPO is not set");
  }
  return repo;
}

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set");
  }
  return token;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export class GithubApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface GithubFile<T = unknown> {
  sha: string;
  content: T;
}

/** GitHub Contents API から1ファイルを取得する。存在しない場合は null。 */
export async function getDataFile<T = unknown>(
  path: string,
): Promise<GithubFile<T> | null> {
  const repo = getRepo();
  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/contents/${encodeURI(path)}`,
    { headers: authHeaders() },
  );

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new GithubApiError(502, `github_get_failed_${res.status}`);
  }

  const body = (await res.json()) as { sha: string; content: string };
  const decoded = Buffer.from(body.content, "base64").toString("utf-8");
  return { sha: body.sha, content: JSON.parse(decoded) as T };
}

/**
 * GitHub Contents API に1ファイルを書き込む(楽観ロック)。
 * sha が既存内容と不一致の場合は GithubApiError(409) を投げる。
 */
export async function putDataFile(
  path: string,
  content: unknown,
  message: string,
  sha: string | null,
): Promise<{ sha: string }> {
  const repo = getRepo();
  const encoded = Buffer.from(
    JSON.stringify(content, null, 2) + "\n",
    "utf-8",
  ).toString("base64");

  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/contents/${encodeURI(path)}`,
    {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `data: ${message}`,
        content: encoded,
        sha: sha ?? undefined,
      }),
    },
  );

  if (res.status === 409 || res.status === 422) {
    throw new GithubApiError(409, "sha_conflict");
  }
  if (!res.ok) {
    throw new GithubApiError(502, `github_put_failed_${res.status}`);
  }

  const body = (await res.json()) as { content: { sha: string } };
  return { sha: body.content.sha };
}
