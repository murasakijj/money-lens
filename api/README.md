# api/

Vercel Functions（サーバーレス関数）。詳細仕様は [docs/api.md](../docs/api.md) を参照。

- `_lib/` — 共通ロジック（認証・GitHub連携・プロンプト定数）
- `data.ts` — GET/PUT /api/data（GitHub Contents API プロキシ）
- `analyze.ts` — POST /api/analyze（月次AI分析）
- `chat.ts` — POST /api/chat（チャット相談）

すべてのエンドポイントは `_lib/auth.ts` の認証チェックを通す。
