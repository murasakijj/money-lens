# money-lens アーキテクチャ設計書

> 最終更新: 2026-07-11
> 対象読者: 実装を担当するAIモデル / 開発者。この文書と docs/ 配下の各設計書を読めば実装に着手できることを目的とする。

---

## システム構成

```
ユーザー（ブラウザ / スマホ）
  │
  │ ① Googleログイン（Firebase Authentication）
  │ ② IDトークン付きでAPI呼び出し（Authorization: Bearer <idToken>）
  ▼
┌───────────────────────────────────────────────┐
│ Vercel                                        │
│  ├─ 静的配信: React + Vite（SPA）              │
│  └─ Vercel Functions（/api/*）                │
│      ├─ 認証ミドルウェア                       │
│      │   Firebase IDトークン検証 + メール許可リスト照合 │
│      ├─ /api/data/*  → GitHub Contents API    │──→ GitHub private repo
│      │                 （GITHUB_TOKEN使用）    │     money-lens-data（JSON）
│      └─ /api/analyze, /api/chat               │──→ AIプロバイダ（抽象化）
│                        （GEMINI_API_KEY等使用） │     デフォルト: Gemini
└───────────────────────────────────────────────┘
```

AI分析部分は `AI_PROVIDER` 環境変数でプロバイダを切り替え可能（デフォルト: Gemini、代替: Anthropic）。詳細は [docs/api.md](./api.md) の「AIプロバイダの抽象化」参照。

### 設計原則

1. **秘密情報はブラウザに置かない**。AIプロバイダのAPIキー・GitHub PATはVercelの環境変数のみに存在し、フロントには一切渡さない。
2. **すべての `/api/*` はサーバ側で認証を検証してから応答する**。家計データはトークン検証+メール許可リスト照合を通過しない限り1バイトも返さない。
3. **バックエンドサーバーは持たない**。Vercel Functions（サーバレス）で完結。
4. **データはGitHub private repoのJSONに保存**し、コミット履歴がそのまま家計データの変更履歴になる。

---

## コンポーネント詳細

### フロントエンド（React + Vite）

- SPA。ルーティングは react-router-dom。
- 状態管理は軽量に（Context + hooks で十分。Redux等は不要）。
- グラフは **Recharts** を使用（棒グラフ・円グラフ・折れ線）。
- Firebase SDK（modular, v10+）は**Authenticationのみ**使用。Firestore/Storageは使わない。
- ログイン後、`user.getIdToken()` で取得したIDトークンを全API呼び出しのAuthorizationヘッダに付与する。

### 認証（Firebase Authentication + サーバ側検証）

walk_diary（C:\workspace\walk_diary）で実績のあるパターンの発展形。

| 層               | 役割                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| フロント         | FirebaseのGoogleログイン（`signInWithPopup`）。未ログインならログイン画面のみ表示                                                     |
| Vercel Functions | `firebase-admin` の `verifyIdToken()` でトークン検証。`decoded.email` を環境変数 `ALLOWED_EMAILS`（カンマ区切り）と照合。不一致は 403 |

**walk_diaryとの違い（重要）**: walk_diaryはFirestoreのセキュリティルールでデータを守っていたが、本アプリのデータはGitHubにあるため、**Vercel Functions側の検証が唯一の防壁**。フロントだけの制限では守れないので、全エンドポイントで必ず検証すること。

### データ保存（GitHub private repo）

- **専用のデータリポジトリ `money-lens-data`（Private）を新規作成**する。
  - 理由: アプリ本体リポジトリ（money-lens）にデータを置くと、データ保存のたびにVercelの自動デプロイが走ってしまうため。
- Vercel FunctionsからGitHub Contents API（`GET/PUT /repos/{owner}/money-lens-data/contents/{path}`）で読み書き。
- 書き込み時は既存ファイルの `sha` を取得してから PUT（楽観ロック）。コミットメッセージは `data: update {file} ({summary})` 形式。
- fine-grained PAT を使用し、スコープは `money-lens-data` リポジトリの Contents: Read and write のみに限定。

### AI分析（Anthropic API）

- モデル: **`claude-sonnet-5`**（入力$3/出力$15 per MTok。2026-08-31まで$2/$10の割引）。
- 呼び出しはVercel Functions内で `@anthropic-ai/sdk` を使用。
- adaptive thinking はSonnet 5のデフォルト（`thinking` 未指定でON）。`temperature` 等のサンプリングパラメータは**指定しない**（Sonnet 5では400エラーになる）。
- チャット（/api/chat）はストリーミング（SSE）でフロントに中継する。
- プロンプト構造は docs/spec.md の「AIプロンプト設計の方針」に従う:
  1. 事実ベースで整理（カテゴリ別収支）
  2. 問題のある傾向を指摘（前月比・予算超過・異常値）
  3. 具体的なアクションを提案（今月から変えられること）
  4. 数年先の影響を説明（習慣を変えた場合のシナリオ比較）

---

## 環境変数（Vercel）

| 変数                       | 用途                                                  | 例                               |
| -------------------------- | ----------------------------------------------------- | -------------------------------- |
| `AI_PROVIDER`              | AIプロバイダ選択（`gemini`\|`anthropic`、未設定時は`gemini`） | `gemini`                   |
| `GEMINI_API_KEY`           | Gemini API呼び出し（デフォルトプロバイダ）            | `AIzaSy...`                      |
| `ANTHROPIC_API_KEY`        | Claude API呼び出し（`AI_PROVIDER=anthropic`時のみ必須）| `sk-ant-...`                     |
| `GITHUB_TOKEN`             | データrepo読み書き（fine-grained PAT）                | `github_pat_...`                 |
| `GITHUB_DATA_REPO`         | データrepo指定                                        | `murasakijj/money-lens-data`     |
| `ALLOWED_EMAILS`           | ログイン許可メール（カンマ区切り）                    | `xxx@gmail.com`                  |
| `FIREBASE_PROJECT_ID`      | 共有Firebaseプロジェクトの ID。IDトークン検証のみに使う（推奨）。サービスアカウントは渡さない | `my-shared-project` |
| `FIREBASE_SERVICE_ACCOUNT` | 旧方式（後方互換）。firebase-admin初期化用サービスアカウントJSON（1行化）。設定されていると `FIREBASE_PROJECT_ID` より優先される。共有プロジェクトでは設定しない | `{"type":"service_account",...}` |

Firebase は household-chore-manager と同じ共有プロジェクトを使う。サーバーは `verifyIdToken()` しか使わないため `FIREBASE_PROJECT_ID` だけで足り、サービスアカウントを渡さないことで他アプリのデータへの権限を持たせない（`FIREBASE_PROJECT_ID` も `FIREBASE_SERVICE_ACCOUNT` も無い場合は設定エラーで 500。401 とは区別される）。切り替え手順は household-chore-manager の `docs/firebase-consolidation.md` を参照。

フロント側（`VITE_` プレフィックス、公開されて問題ない値のみ）:

| 変数                                             | 用途                                            |
| ------------------------------------------------ | ----------------------------------------------- |
| `VITE_FIREBASE_API_KEY` ほか firebaseConfig 一式 | Firebase Auth初期化（共有プロジェクトの Web アプリ設定。公開設定値で秘密ではない） |

---

## セキュリティチェックリスト（実装時に必ず守る）

- [ ] `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `GITHUB_TOKEN` / `FIREBASE_SERVICE_ACCOUNT` がフロントのバンドルに含まれないこと（`VITE_` を付けない）
- [ ] すべての `/api/*` が認証ミドルウェアを通ること（認証なしのエンドポイントを作らない）
- [ ] `ALLOWED_EMAILS` 照合は小文字化して比較
- [ ] エラーレスポンスに内部情報（トークン、リポジトリパス等）を含めない
- [ ] money-lens / money-lens-data 両リポジトリがPrivateであること
- [ ] Firebase Authの承認済みドメインにVercelの本番URLのみ登録（プレビューURLは必要時のみ）。登録先は共有プロジェクト（household-chore-manager と同じ）の Authentication > 設定 > 承認済みドメイン

---

## 技術スタック一覧

| 領域           | 技術                                             | 備考                        |
| -------------- | ------------------------------------------------ | --------------------------- |
| フロント       | React 19 + Vite + TypeScript                     |                             |
| ルーティング   | react-router-dom                                 |                             |
| グラフ         | Recharts                                         |                             |
| 認証           | Firebase Authentication（Google）                | Authのみ使用                |
| ホスティング   | Vercel（Hobby）                                  | pushで自動デプロイ          |
| API            | Vercel Functions（`api/` ディレクトリ、Node.js） |                             |
| トークン検証   | firebase-admin                                   |                             |
| AI             | @anthropic-ai/sdk + `claude-sonnet-5`            |                             |
| データ         | GitHub Contents API（money-lens-data）           |                             |
| 初期データ移行 | Python + openpyxl（ローカル実行のみ）            | docs/data-migration.md 参照 |

---

## 関連ドキュメント

- [data-model.md](./data-model.md) — JSONスキーマ
- [api.md](./api.md) — Functionsエンドポイント仕様
- [ui.md](./ui.md) — 画面仕様
- [data-migration.md](./data-migration.md) — Excel→JSON移行
- [implementation-plan.md](./implementation-plan.md) — 実装タスク分解
