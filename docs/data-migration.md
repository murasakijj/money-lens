# money-lens 初期データ移行仕様書（Excel → JSON）

> 最終更新: 2026-07-11
> 既存の家計簿Excelを [data-model.md](./data-model.md) のJSON形式に変換し、`money-lens-data` リポジトリに初期投入する。

---

## ソースファイル

- 原本: `C:\Users\<ユーザー名>\OneDrive\ドキュメント\家事\家計簿\収支表.xlsx`（bash表記: `/c/Users/u9c33/OneDrive/ドキュメント/家事/家計簿/収支表.xlsx`）
- 作業用コピー: `c:\workspace\money-lens\.claude\tmp\budget.xlsx`（2026-07-11時点のコピー。`.claude/` はgitignore済み）

> ⚠️ **パスの文字化けに注意**: この環境ではPythonから日本語を含むユーザープロファイルパスを直接開くと文字化けで失敗する。**必ずASCIIのみのパスにコピーしてから処理する**こと（bashの `cp` は日本語パスを正しく扱える）。

```bash
cp "/c/Users/u9c33/OneDrive/ドキュメント/家事/家計簿/収支表.xlsx" /c/workspace/money-lens/.claude/tmp/budget.xlsx
```

---

## Excelの構造（2026-07-11時点の実測）

| シート   | 範囲     | 内容                                              |
| -------- | -------- | ------------------------------------------------- |
| メモ     | A2:D42   | 運用メモ（移行対象外。要望の背景資料）            |
| 統計     | A1:Q27   | 月次の口座残高（月初/月末）と★特別出費マーク+メモ |
| 収支一覧 | A1:M1477 | 取引明細 1,474件（2025-01-01〜2026-05-15）        |
| 給与一覧 | A1:AM71  | 給与明細 56件（2021-11〜、給与/賞与）             |
| マスタ   | A1:B3    | 符号規約: 収入>=0 / 支出<0 / 支出(カード返済)<0   |

### 収支一覧（データは3行目から）

列: `# | Date | Amount | Account Currency | Description | Memo | Receipt | Category | Account Name | Account Number | Work`

- Date は date 型セル → `YYYY-MM-DD` 文字列に変換
- Account Number は下4桁マスク文字列。**JSONには保存しない**（不要な情報を持たない）
- Category 実測値（件数順）: Eating Out(455), Groceries(187), Convenience Store(170), Train(142), Online Service(44), Books & Magazines(35), Card Payment(33), Salary(32), Uncategorized(32), Taxi(29), Shopping(29), Gas(23), Holiday & Leisure(19), Clothing(19), Lunch(19), Mobile Phone(18), Internet(17), Electricity(17), Home(13), Rent(12), Home Supplies(12), 他 約40種（data-model.md のcategories.jsonに全て定義済み）
- Account Name 実測値: `エポスゴールドカード`(1216), `普通`(132), `アトレビューSuicaカード`(126)

### 給与一覧（ヘッダ2段、データは4行目から）

列グループ: 給与情報(年/月/給与・賞与) → 合計(支給合計/控除合計/差引支給額) → 支給(基本給〜基本給調整の9列) → 控除(健康保険〜レインバースの10列) → 勤怠(8列) → 第1口座/銀行振込額/課税対象額 → 記事

- `年` は「2021年」形式 → 数値に変換。`月` は「11月」形式 → 数値に変換
- 空セルは `null` のまま保存

### 統計（データは月ごとの行、2025/2026年分）

- 列C/D: 給与口座の月初金額/月末金額 → `months.json` の `balanceStart`/`balanceEnd`
- ★列とメモ列（例: `指輪(73万円)`、`家(東横建設100万円)`）→ `isSpecial`/`note`
- 年収支・月収支の集計列は**移行しない**（アプリ側で明細から再計算するため）

---

## 変換スクリプト仕様（scripts/migrate_excel.py）

- Python 3 + openpyxl（`data_only=True` で読み込み、数式ではなく値を取得）
- 入力: `--input <xlsxパス>`、出力: `--output <出力ディレクトリ>`（money-lens-dataのローカルクローンを想定）
- 出力ファイル: `transactions/2025.json`, `transactions/2026.json`, `salaries.json`, `months.json`
- `categories.json` / `budgets.json` / `settings.json` は data-model.md の初期値を手動配置（スクリプト出力ではない）

### 変換ルール

1. **transactions**: 収支一覧の各行 → data-model.md のスキーマへ。`id` は日付順に `t-{year}-{連番6桁}`。`isSpecial` は初期値 `false`（移行後にアプリ上で付与する。統計シートの★は月単位なので `months.json` 側に入る）
2. **salaries**: 給与一覧の各行 → スキーマへ。同年月に給与と賞与がある場合、賞与の `id` は `-bonus` サフィックス
3. **months**: 統計シートの2025/2026年の行 → `months.json`。★とメモを `isSpecial`/`note` に
4. 文字列は `str.strip()`。金額は int。日付のタイムゾーン処理は不要（date型のみ）

### 検証（スクリプト内で自動チェックし、結果を表示）

- [ ] 取引件数が元Excelと一致（1,474件。移行時点で増えていればその件数）
- [ ] 年別件数・カテゴリ別件数が元と一致
- [ ] `sum(amount)` が年ごとに元Excelと一致
- [ ] 給与件数56件（移行時点の件数）と `netPay = grossTotal - deductionTotal` の整合
- [ ] 未知カテゴリ（categories.jsonにないもの）があれば警告リスト表示

---

## 投入手順

1. GitHubに Private リポジトリ `money-lens-data` を作成
2. ローカルにクローンし、スクリプトを実行してJSONを生成
3. 検証結果を確認して `git push`
4. アプリの `GITHUB_DATA_REPO` 環境変数に設定し、ダッシュボードで2025年の月次集計がExcelの感覚と合っているか目視確認

> 移行後もExcel原本は削除しない（原始データとして保持）。以後の新規データはアプリのCSVインポート機能で取り込む。
