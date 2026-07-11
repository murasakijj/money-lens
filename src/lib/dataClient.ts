import { auth } from "./firebase";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface DataFile<T> {
  file: string;
  sha: string;
  content: T;
}

const dataCache = new Map<string, DataFile<unknown>>();
const pendingReads = new Map<string, Promise<DataFile<unknown>>>();

export class DataConflictError<T = unknown> extends ApiError {
  latest: DataFile<T>;

  constructor(latest: DataFile<T>) {
    super(409, "sha_conflict");
    this.latest = latest;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError(401, "not_authenticated");
  }
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? "unknown_error";
}

/** ログイン直後の許可判定に使う(GitHubへの往復なし)。 */
export async function checkAuth(): Promise<void> {
  const headers = await authHeader();
  const res = await fetch("/api/auth-check", { headers });
  if (!res.ok) {
    throw new ApiError(res.status, await readError(res));
  }
}

export async function getData<T>(
  file: string,
  options: { force?: boolean } = {},
): Promise<DataFile<T>> {
  if (!options.force) {
    const cached = dataCache.get(file);
    if (cached) return cached as DataFile<T>;
    const pending = pendingReads.get(file);
    if (pending) return pending as Promise<DataFile<T>>;
  }

  const request = (async () => {
    const headers = await authHeader();
    const res = await fetch(`/api/data?file=${encodeURIComponent(file)}`, {
      headers,
    });
    if (!res.ok) {
      throw new ApiError(res.status, await readError(res));
    }
    const result = (await res.json()) as DataFile<T>;
    dataCache.set(file, result as DataFile<unknown>);
    return result;
  })();

  pendingReads.set(file, request as Promise<DataFile<unknown>>);
  try {
    return await request;
  } finally {
    if (pendingReads.get(file) === request) pendingReads.delete(file);
  }
}

export async function putData(
  file: string,
  sha: string | null,
  content: unknown,
  message: string,
): Promise<{ sha: string }> {
  const headers = await authHeader();
  const res = await fetch(`/api/data?file=${encodeURIComponent(file)}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ sha, content, message }),
  });
  if (!res.ok) {
    const message = await readError(res);
    if (res.status === 409) {
      const latest = await getData(file, { force: true });
      throw new DataConflictError(latest);
    }
    throw new ApiError(res.status, message);
  }
  const result = (await res.json()) as { sha: string };
  dataCache.set(file, { file, sha: result.sha, content });
  return result;
}

export function clearDataCache(): void {
  dataCache.clear();
  pendingReads.clear();
}
