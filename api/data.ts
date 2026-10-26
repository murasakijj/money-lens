import type { ApiRequest, ApiResponse } from "./_lib/types.js";
import { requireAuth, AuthError } from "./_lib/auth.js";
import { getDataFile, putDataFile, GithubApiError } from "./_lib/github.js";
import { isAllowedFile } from "./_lib/fileAllowlist.js";

interface PutBody {
  sha?: string | null;
  content?: unknown;
  message?: string;
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
    console.error("[api] unhandled", err);
    res.status(500).json({ error: "internal_error" });
    return;
  }

  const file = typeof req.query.file === "string" ? req.query.file : undefined;
  if (!file || !isAllowedFile(file)) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  try {
    if (req.method === "GET") {
      const result = await getDataFile(file);
      if (result === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(200).json({ file, sha: result.sha, content: result.content });
      return;
    }

    if (req.method === "PUT") {
      const body = (req.body ?? {}) as PutBody;
      if (body.content === undefined || !body.message) {
        res.status(400).json({ error: "invalid_body" });
        return;
      }
      const result = await putDataFile(
        file,
        body.content,
        body.message,
        body.sha ?? null,
      );
      res.status(200).json({ file, sha: result.sha });
      return;
    }

    res.status(405).json({ error: "method_not_allowed" });
  } catch (err) {
    if (err instanceof GithubApiError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: "upstream_error" });
  }
}
