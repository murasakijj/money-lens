# money-lens API設計書（Vercel Functions）

> 最終更新: 2026-07-11
> 実装場所: リポジトリ直下の `api/` ディレクトリ（Vercel Functions規約）。Node.js + TypeScript。

---

## 共通仕様

### 認証（全エンドポイント必須）

すべてのリクエストは以下のヘッダを要求する:

```
Authorization: Bearer <Firebase IDトークン>
```

処理フロー（共通ミドルウェア `api/_lib/auth.ts` に実装）:

1. `firebase-admin` の `auth().verifyIdToken(token)` で検証。失敗 → **401**
2. `decoded.email` を小文字化し、環境変数 `ALLOWED_EMAILS`（カンマ区切り・小文字化して比較）と照合。不一致 → **403**
3. 通過した場合のみハンドラ本体を実行

**認証なしで応答するエンドポイントを作らないこと。** ヘルスチェック等も不要。

### エラーレスポンス

```json
{ "error": "unauthorized" }
```

`error` は機械可読な短いコードのみ。内部情報（スタックトレース、リポジトリパス、トークン）を含めない。

| ステータス | 意味 |
|---|---|
| 401 | トークンなし/無効 |
| 403 | 許可リスト外のメール |
| 404 | データファイルなし |
| 409 | GitHub sha 不一致（再読込が必要） |
| 502 | GitHub/Anthropic 上流エラー |

---

## 1. データAPI

GitHub Contents API のプロキシ。対象リポジトリは環境変数 `GITHUB_DATA_REPO`。
パストラバーサル防止のため、`file` パラメータは許可リスト（`transactions/\d{4}\.json` と固定ファイル名）に一致するもののみ受け付ける。

### GET /api/data?file={path}

例: `GET /api/data?file=transactions/2025.json`

レスポンス:

```json
{
  "file": "transactions/2025.json",
  "sha": "abc123...",
  "content": { "year": 2025, "transactions": [...] }
}
```

- GitHubの `GET /repos/{repo}/contents/{path}` を呼び、base64をデコードしてJSONで返す。
- `sha` はクライアントが保持し、書き込み時に返す（楽観ロック）。

### PUT /api/data?file={path}

リクエストボディ:

```json
{
  "sha": "abc123...",
  "content": { ... },
  "message": "取引3件追加 (2026-07)"
}
```

- GitHubの `PUT /repos/{repo}/contents/{path}` に `sha` 付きでコミット。
- コミットメッセージ: `data: {message}`。
- 新規ファイル作成時は `sha: null`。
- sha不一致（GitHubが409/422を返す）→ クライアントに **409** を返し、フロントは再読込してマージを促す。

---

## 2. AI分析API

### POST /api/analyze — 月次自動分析（Phase 2）

リクエスト:

```json
{
  "targetMonth": "2026-06",
  "summary": {
    "byGroup": { "food": -85200, "transport": -18400, "...": 0 },
    "prevMonth": { "food": -71000, "...": 0 },
    "budgets": { "food": 90000 },
    "income": 580000,
    "specialNotes": ["定期券購入(5万円)"],
    "recentMonthsTrend": [ { "month": "2026-01", "expense": -350000, "income": 580000 } ]
  }
}
```

- **集計はフロントで行い、生の明細ではなく集計済みサマリーを送る**（トークン節約 + プロンプトの安定化）。
- サーバ側でシステムプロンプトを組み立てて `claude-sonnet-5` を呼ぶ。

レスポンス: SSEストリーミング（`text/event-stream`）でテキストを逐次返す。

システムプロンプトの構造（`api/_lib/prompts.ts` に定数化）:

```
あなたは家計アドバイザーです。渡された家計データについて、以下の4段構成で日本語で分析してください。
1. 事実の整理: カテゴリ別の収支を簡潔にまとめる
2. 傾向の指摘: 前月比の変化、予算超過、異常値を指摘する（特別出費フラグがある項目は「特別な月」として通常と区別する）
3. 今月からできる具体的なアクション: 実行可能な改善案を2〜3個
4. 数年先への影響: その習慣を変えた場合/変えない場合の3〜5年シナリオ比較
断定的な事実と推測を区別し、金額は必ず渡されたデータに基づくこと。
```

### POST /api/chat — チャット相談（Phase 2）

リクエスト:

```json
{
  "messages": [
    { "role": "user", "content": "食費が多いけどどう減らす?" }
  ],
  "context": { "targetMonth": "2026-06", "summary": { ... } }
}
```

- `context.summary` はシステムプロンプトに埋め込む（/api/analyze と同じ集計形式）。
- 会話履歴はフロントが保持して毎回全量送る（APIはステートレス）。
- レスポンスはSSEストリーミング。

### Anthropic呼び出しの実装規約

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // ANTHROPIC_API_KEY を環境変数から自動取得

const stream = client.messages.stream({
  model: "claude-sonnet-5",
  max_tokens: 4096,
  system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
  messages,
});
```

- **`temperature` / `top_p` / `top_k` は指定しない**（claude-sonnet-5では非デフォルト値は400エラー）。
- **`thinking` は未指定でよい**（Sonnet 5はデフォルトでadaptive thinking。max_tokensに思考分の余裕を持たせる）。
- システムプロンプト（固定部分）に `cache_control` を付け、プロンプトキャッシュを効かせる。可変データ（当月サマリー）はmessages側に置く。
- ストリームはSSEでフロントに中継。エラー時はSDKの型付き例外（`Anthropic.RateLimitError` 等）で分岐し、502 + 短いエラーコードを返す。

### コスト目安

| 操作 | 概算トークン | 概算コスト（$3/$15、割引期間$2/$10） |
|---|---|---|
| 月次分析1回 | 入力 ~3K / 出力 ~1.5K | 約 $0.03（約5円） |
| チャット1往復 | 入力 ~4K / 出力 ~1K | 約 $0.03 |

個人利用（月に分析数回+チャット数十回）で **月数十円〜数百円** 程度。

---

## 3. ディレクトリ構成（アプリ側リポジトリ）

```
money-lens/
├─ api/
│   ├─ _lib/
│   │   ├─ auth.ts        ← IDトークン検証 + メール許可リスト
│   │   ├─ github.ts      ← Contents API ラッパー
│   │   └─ prompts.ts     ← システムプロンプト定数
│   ├─ data.ts            ← GET/PUT /api/data
│   ├─ analyze.ts         ← POST /api/analyze
│   └─ chat.ts            ← POST /api/chat
├─ src/                   ← React アプリ
├─ docs/                  ← 設計書（この文書群）
└─ scripts/               ← Excel移行スクリプト（ローカル実行のみ）
```
