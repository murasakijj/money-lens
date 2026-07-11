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

export async function getData<T>(file: string): Promise<DataFile<T>> {
  const headers = await authHeader();
  const res = await fetch(`/api/data?file=${encodeURIComponent(file)}`, {
    headers,
  });
  if (!res.ok) {
    throw new ApiError(res.status, await readError(res));
  }
  return (await res.json()) as DataFile<T>;
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
    throw new ApiError(res.status, await readError(res));
  }
  return (await res.json()) as { sha: string };
}
