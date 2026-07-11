# money-lens — Claude Code ガイド

## プロジェクト概要

個人向け家計分析ツール。収支の可視化 + Claude AIによる事実ベースの分析・改善提案・将来シミュレーション（住宅ローン・教育費）を提供する。既存の家計簿Excelから初期データを移行する。

## 実装の進め方（重要）

**実装は [docs/implementation-plan.md](../docs/implementation-plan.md) のタスクを上から順に進める。** 各タスクの受け入れ条件を満たしてから次へ。設計の詳細は以下を参照:

| 文書                                                | 内容                                        |
| --------------------------------------------------- | ------------------------------------------- |
| [docs/spec.md](../docs/spec.md)                     | 仕様書（確定版・全体像）                    |
| [docs/architecture.md](../docs/architecture.md)     | システム構成・認証・セキュリティ・環境変数  |
| [docs/data-model.md](../docs/data-model.md)         | JSONスキーマ                                |
| [docs/api.md](../docs/api.md)                       | Vercel Functions仕様・Anthropic呼び出し規約 |
| [docs/ui.md](../docs/ui.md)                         | 画面仕様                                    |
| [docs/data-migration.md](../docs/data-migration.md) | Excel→JSON移行                              |

設計とズレる実装をしたくなったら、勝手に変えず**まずユーザーに確認**し、docs/ を直してからコードを書く（docsが常に正）。

## 技術スタック（確定）

- **フロントエンド**: React + Vite + TypeScript（グラフ: Recharts）
- **API**: Vercel Functions（`api/` ディレクトリ）— 秘密鍵はすべてここ
- **認証**: Firebase Authentication（Googleログイン）+ Functions側でIDトークン検証 + `ALLOWED_EMAILS` 照合
- **データ保存**: GitHub private repo `money-lens-data`（JSON、アプリrepoと分離）
- **AI分析**: Anthropic API `claude-sonnet-5` — Functionsプロキシ経由。`temperature`等のsamplingパラメータは指定禁止（400になる）。SSEストリーミング

## リポジトリ

- アプリ: https://github.com/murasakijj/money-lens（Private）
- データ: https://github.com/murasakijj/money-lens-data（Private・作成予定）

## 絶対に守るセキュリティルール

1. `ANTHROPIC_API_KEY` / `GITHUB_TOKEN` / `FIREBASE_SERVICE_ACCOUNT` をフロントに出さない（`VITE_` を付けない）
2. すべての `/api/*` は認証ミドルウェア（IDトークン検証+メール許可リスト）を通す。例外なし
3. 両リポジトリともPrivateを維持
4. 認証を先に実装してから中身を作る（Phase 0が最優先）

## 環境固有の注意

- **日本語パスの文字化け**: Pythonからユーザープロファイル配下の日本語パス（`C:\Users\...\OneDrive\ドキュメント\...`）を直接開くと失敗する。bashの `cp` でASCIIパス（例: `.claude/tmp/`）にコピーしてから処理する
- メモリ・ノート類はプロジェクト内 `.claude/` 配下のみ使用（ユーザープロファイルパスは使わない）
- 金額計算はすべて整数（円）。浮動小数を使わない

## 開発フェーズ

| フェーズ | 内容                                                            |
| -------- | --------------------------------------------------------------- |
| Phase 0  | 基盤・Vercel連携・Firebase認証・データプロキシ                  |
| Phase 1  | Excel移行・ダッシュボード・明細/CSVインポート・給与/資産画面    |
| Phase 2  | AI月次分析 + チャットUI                                         |
| Phase 3  | ライフイベント入力・将来シミュレーター（ローン/教育費）・AI講評 |

## 参考: 既存資産

- 家計簿Excel: `/c/Users/u9c33/OneDrive/ドキュメント/家事/家計簿/収支表.xlsx`（bash表記。作業コピー: `.claude/tmp/budget.xlsx`）
- Googleログインの実績実装: `C:\workspace\walk_diary`（Firebase Auth + メール制限。ただしデータ保護の仕組みは異なるので docs/architecture.md の設計に従うこと）
