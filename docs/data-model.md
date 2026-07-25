# money-lens データモデル設計書

> 最終更新: 2026-07-11
> データは GitHub private repo `money-lens-data` にJSONで保存する。
> スキーマは既存の家計簿Excel（収支表.xlsx）の構造を基に設計。移行手順は [data-migration.md](./data-migration.md) を参照。

---

## リポジトリ構成（money-lens-data）

```
money-lens-data/
├─ transactions/
│   ├─ 2025.json          ← 年ごとの取引明細
│   └─ 2026.json
├─ salaries.json           ← 給与明細（全期間）
├─ months.json             ← 月ごとのメタ情報（特別出費マーク・メモ・残高）
├─ categories.json         ← カテゴリマスタ（英語カテゴリ→日本語・グループ・予算）
├─ budgets.json            ← 月間予算
├─ life-events.json        ← Phase 3: ライフイベント
└─ settings.json           ← アプリ設定
```

**分割方針**: 取引は件数が多い（年間1,000件超）ため年単位で分割。それ以外は単一ファイル。1ファイルはGitHub Contents APIの実用上限（〜1MB）に収まる想定。

---

## 1. transactions/{year}.json — 取引明細

Excel「収支一覧」シート（カード家計簿アプリのCSVエクスポート形式）に対応。

```json
{
  "year": 2025,
  "transactions": [
    {
      "id": "t-2025-000001",
      "date": "2025-01-01",
      "amount": -737,
      "currency": "JPY",
      "description": "フアミリ－マ－トイシガキハマサキニチヨウ",
      "memo": "ファミリーマート石垣浜崎日曜",
      "category": "Convenience Store",
      "account": "エポスゴールドカード",
      "work": "Personal",
      "isSpecial": false,
      "specialNote": null
    }
  ]
}
```

| フィールド    | 型             | 説明                                                                                               |
| ------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `id`          | string         | `t-{year}-{連番6桁}`。移行時に採番。アプリで追加する場合は `t-{year}-{timestamp}`                  |
| `date`        | string         | ISO 8601（YYYY-MM-DD）                                                                             |
| `amount`      | number         | **符号規約: 収入 >= 0、支出 < 0**（Excelマスタシートの規約を踏襲）                                 |
| `currency`    | string         | 現状 `"JPY"` 固定                                                                                  |
| `description` | string         | 明細名（元データはカナ表記が多い）                                                                 |
| `memo`        | string \| null | 補足                                                                                               |
| `category`    | string         | `categories.json` のキー（元アプリの英語カテゴリをそのまま使用）                                   |
| `account`     | string         | 口座/カード名。既存データ: `エポスゴールドカード` / `アトレビューSuicaカード` / `普通`（銀行口座） |
| `work`        | string         | 元データの区分（`Personal` 等）。集計には未使用だが保持                                            |
| `isSpecial`   | boolean        | ★特別出費フラグ（旅行・家購入などの非日常出費）                                                    |
| `specialNote` | string \| null | 特別出費の説明                                                                                     |

### 集計上の重要ルール

- **`Card Payment`（カード返済）と `Transfer`（振替）は支出集計から除外する**。銀行口座からのカード引き落としは、カード側の明細と二重計上になるため。Excelマスタシートの「支出(カード返済)」を独立区分としている設計を踏襲。
- 月次集計 = その月の `amount` を `categories.json` のグループ単位で合算（除外カテゴリを除く）。

---

## 2. salaries.json — 給与明細

Excel「給与一覧」シート（2021-11以降、給与/賞与 56件）に対応。

```json
{
  "salaries": [
    {
      "id": "s-2021-11",
      "year": 2021,
      "month": 11,
      "type": "給与",
      "grade": "ML10",
      "grossTotal": 443334,
      "deductionTotal": 48210,
      "netPay": 395124,
      "payments": {
        "基本給": 433334,
        "住宅手当": 10000,
        "前払退職金": null,
        "時間外勤務手当": null,
        "深夜手当": null,
        "賞与基本給": null,
        "特別支給": null,
        "その他支給": null,
        "基本給調整": null
      },
      "deductions": {
        "健康保険": null,
        "厚生年金": null,
        "雇用保険": 1330,
        "社会保険料合計": 1330,
        "所得税": 20180,
        "住民税": 26700,
        "年調過不足額": null,
        "その他控除額": null,
        "株式購入": null,
        "レインバース": null
      },
      "attendance": {
        "所定勤務日数": 30,
        "勤務日数": 30,
        "欠勤日数": 0,
        "時間外勤務時間": 0,
        "深夜時間": 0,
        "休日時間": 0,
        "精算残業時間": 0,
        "60時間超": null
      },
      "bankTransfer": 395124,
      "taxableAmount": 395124,
      "note": null
    }
  ]
}
```

| フィールド                               | 説明                                                     |
| ---------------------------------------- | -------------------------------------------------------- |
| `id`                                     | `s-{year}-{month}`。賞与は `s-{year}-{month}-bonus`      |
| `type`                                   | `"給与"` \| `"賞与"`                                     |
| `grade`                                  | 給与体系（ML7〜ML10 等）。昇給推移の分析に使用           |
| `payments` / `deductions` / `attendance` | Excelの列名をそのままキーにする（値が空のセルは `null`） |

---

## 3. months.json — 月次メタ情報

Excel「統計」シートの ★特別出費マーク・メモ・口座残高スナップショットに対応。

```json
{
  "months": [
    {
      "month": "2025-05",
      "isSpecial": true,
      "note": "指輪(73万円)",
      "balanceStart": 14370542,
      "balanceEnd": 13834055
    }
  ]
}
```

| フィールド                    | 説明                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| `month`                       | `YYYY-MM`                                                                |
| `isSpecial`                   | ★マーク。「この月は特別な月」の可視化に使う（メモシートの要望）          |
| `note`                        | 特別出費の内容（例: `家(東横建設100万円)`、`サイパン旅行代(27万8千円)`） |
| `balanceStart` / `balanceEnd` | 給与口座の月初/月末残高（円）。資産推移グラフに使用                      |

---

## 4. categories.json — カテゴリマスタ

元アプリの英語カテゴリ（約60種）を日本語ラベルとグループにマッピングする。**ユーザーが画面から編集できる**想定。

```json
{
  "groups": [
    { "id": "food", "label": "食費", "color": "#e07a5f" },
    { "id": "transport", "label": "交通", "color": "#3d5a80" },
    { "id": "fixed", "label": "固定費", "color": "#5f797b" },
    { "id": "home", "label": "住まい", "color": "#81b29a" },
    { "id": "leisure", "label": "娯楽・レジャー", "color": "#f2cc8f" },
    { "id": "shopping", "label": "買い物", "color": "#9a8c98" },
    { "id": "learning", "label": "教養・自己投資", "color": "#6d597a" },
    { "id": "health", "label": "健康・医療", "color": "#84a59d" },
    { "id": "social", "label": "交際・贈答", "color": "#b5838d" },
    { "id": "tax_fee", "label": "税金・手数料", "color": "#8d8d8d" },
    { "id": "other", "label": "その他", "color": "#adb5bd" },
    { "id": "income", "label": "収入", "color": "#2a9d8f" },
    { "id": "excluded", "label": "振替（集計除外）", "color": "#ced4da" }
  ],
  "categories": {
    "Eating Out": { "label": "外食", "group": "food" },
    "Groceries": { "label": "食料品", "group": "food" },
    "Convenience Store": { "label": "コンビニ", "group": "food" },
    "Lunch": { "label": "昼食", "group": "food" },
    "Cafe & Coffee Shop": { "label": "カフェ", "group": "food" },
    "Izakaya & Bars": { "label": "居酒屋・バー", "group": "food" },
    "Restaurant": { "label": "レストラン", "group": "food" },
    "Train": { "label": "電車", "group": "transport" },
    "Taxi": { "label": "タクシー", "group": "transport" },
    "Bus": { "label": "バス", "group": "transport" },
    "Gas": { "label": "ガソリン", "group": "transport" },
    "Fuel": { "label": "燃料", "group": "transport" },
    "Tollway": { "label": "有料道路", "group": "transport" },
    "Parking": { "label": "駐車場", "group": "transport" },
    "Rent": { "label": "家賃", "group": "fixed" },
    "Electricity": { "label": "電気", "group": "fixed" },
    "Water": { "label": "水道", "group": "fixed" },
    "Internet": { "label": "ネット回線", "group": "fixed" },
    "Mobile Phone": { "label": "携帯電話", "group": "fixed" },
    "Home": { "label": "住宅関連", "group": "home" },
    "Home Supplies": { "label": "日用品", "group": "home" },
    "Home Improvement": { "label": "リフォーム・DIY", "group": "home" },
    "Holiday & Leisure": { "label": "レジャー", "group": "leisure" },
    "Entertainment": { "label": "エンタメ", "group": "leisure" },
    "Hotel": { "label": "宿泊", "group": "leisure" },
    "Onsen": { "label": "温泉", "group": "leisure" },
    "Museum & Theatre": { "label": "美術館・劇場", "group": "leisure" },
    "Games": { "label": "ゲーム", "group": "leisure" },
    "Omiyage": { "label": "お土産", "group": "leisure" },
    "Shopping": { "label": "買い物", "group": "shopping" },
    "Clothing": { "label": "衣類", "group": "shopping" },
    "Electronics": { "label": "家電", "group": "shopping" },
    "Beauty": { "label": "美容", "group": "shopping" },
    "Office Supplies": { "label": "文具", "group": "shopping" },
    "Books & Magazines": { "label": "書籍・雑誌", "group": "learning" },
    "Education": { "label": "教育", "group": "learning" },
    "Online Service": { "label": "オンラインサービス", "group": "learning" },
    "Health & Medical": { "label": "医療", "group": "health" },
    "Pharmacy": { "label": "薬局", "group": "health" },
    "Gifts & Donations": { "label": "贈答・寄付", "group": "social" },
    "Charity": { "label": "寄付", "group": "social" },
    "Taxes": { "label": "税金", "group": "tax_fee" },
    "Residency Tax": { "label": "住民税", "group": "tax_fee" },
    "Fees": { "label": "手数料", "group": "tax_fee" },
    "Transfer Fee": { "label": "振込手数料", "group": "tax_fee" },
    "ATM Fee": { "label": "ATM手数料", "group": "tax_fee" },
    "Auto Insurance": { "label": "自動車保険", "group": "other" },
    "Pets": { "label": "ペット", "group": "other" },
    "Shipping": { "label": "配送料", "group": "other" },
    "Cash & ATM": { "label": "現金引出", "group": "other" },
    "Uncategorized": { "label": "未分類", "group": "other" },
    "Salary": { "label": "給与", "group": "income" },
    "Bonus": { "label": "賞与", "group": "income" },
    "Interest Income": { "label": "利息", "group": "income" },
    "Investments": { "label": "投資", "group": "income" },
    "Other Income": { "label": "その他収入", "group": "income" },
    "Card Payment": { "label": "カード返済", "group": "excluded" },
    "Transfer": { "label": "口座振替", "group": "excluded" }
  }
}
```

- `group: "excluded"` のカテゴリは**支出・収入の集計から除外**する（二重計上防止）。
- 未知のカテゴリがインポートで現れた場合は `Uncategorized` 扱いにせず、そのままキー追加して `group: "other"` を仮設定し、画面で振り分けられるようにする。
- グラフの色は `groups[].color` を使用（グループ単位で色を固定し、月をまたいでも同じグループが同じ色になるようにする）。

---

## 5. budgets.json — 予算

メモシートの「食費: 1日MAX3000円」「毎月貯金できる額を決める」に対応。

```json
{
  "monthlyBudgets": {
    "food": 90000,
    "transport": 20000,
    "fixed": 220000,
    "leisure": 30000
  },
  "savingsTarget": 100000,
  "note": "手取り月58万想定。固定費合計 約21.8万円"
}
```

- キーは `categories.json` の `groups[].id`。
- `savingsTarget`: 月間貯金目標（円）。ダッシュボードで達成状況を表示。

---

## 6. life-events.json — ライフイベント（Phase 3）

```json
{
  "profile": {
    "birthYear": null,
    "householdSize": 2
  },
  "events": [
    {
      "id": "e-001",
      "type": "housing_loan",
      "label": "住宅ローン",
      "startYear": 2025,
      "params": {
        "principal": null,
        "annualRate": null,
        "years": 35,
        "monthlyPayment": null,
        "bonusPayment": 0
      }
    },
    {
      "id": "e-002",
      "type": "childbirth",
      "label": "第一子誕生",
      "startYear": null,
      "params": {
        "educationPlan": "public",
        "childcareMonthly": null
      }
    }
  ]
}
```

| `type`          | 説明                | 主なパラメータ                     |
| --------------- | ------------------- | ---------------------------------- |
| `housing_loan`  | 住宅ローン返済      | 借入額・金利・期間・月額・繰上返済 |
| `childbirth`    | 出産・育児          | 教育方針（公立/私立）・保育費      |
| `income_change` | 転職・昇給          | 変化後の月収・時期                 |
| `custom`        | 任意の定期支出/収入 | 月額・開始/終了                    |

シミュレーターはこれらと過去実績（transactions/salaries）から3〜5年の月次キャッシュフローを試算する。教育費の標準値（公立/私立別の年間費用）はアプリ内に定数として持つ。

---

## 7. settings.json

```json
{
  "appVersion": 1,
  "accounts": ["エポスゴールドカード", "アトレビューSuicaカード", "普通"],
  "importProfiles": [
    {
      "id": "card-app-csv",
      "label": "カード家計簿アプリCSV",
      "columns": [
        "Date",
        "Amount",
        "Account Currency",
        "Description",
        "Memo",
        "Receipt",
        "Category",
        "Account Name",
        "Account Number",
        "Work"
      ]
    }
  ]
}
```

---

## データアクセスパターン

- フロントは起動時に `categories.json` / `budgets.json` / `months.json` / 直近2年分の `transactions/*.json` を読み込み、メモリ上で集計する（クライアント集計。データ量的に十分軽い）。
- 書き込みは「変更されたファイル全体をPUT」する（部分更新はしない）。
- 同時編集は想定しない（利用者1名）。GitHubの `sha` 不一致が起きたら再読込を促す。
