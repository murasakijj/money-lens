#!/usr/bin/env python3
"""money-lens: 家計簿Excel(収支表.xlsx) -> money-lens-data JSON 移行スクリプト

docs/data-migration.md の仕様に厳密に従う。

使い方:
    python3 scripts/migrate_excel.py --input .claude/tmp/budget.xlsx --output ../money-lens-data

出力:
    <output>/transactions/2025.json
    <output>/transactions/2026.json
    <output>/salaries.json
    <output>/months.json

categories.json / budgets.json / settings.json はこのスクリプトでは生成しない
(data-model.md の初期値を手動配置する運用)。ただし検証時に <output>/categories.json
が存在すればそれを読み込み、未知カテゴリの警告に使う。
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

# ---------------------------------------------------------------------------
# 収支一覧シートの列番号 (1-indexed)
# ---------------------------------------------------------------------------
TX_SHEET = "収支一覧"
TX_HEADER_ROW = 2
TX_DATA_START_ROW = 3
COL_TX_SEQ = 2  # '#'
COL_TX_DATE = 3
COL_TX_AMOUNT = 4
COL_TX_CURRENCY = 5
COL_TX_DESCRIPTION = 6
COL_TX_MEMO = 7
COL_TX_RECEIPT = 8
COL_TX_CATEGORY = 9
COL_TX_ACCOUNT_NAME = 10
COL_TX_ACCOUNT_NUMBER = 11  # 保存しない
COL_TX_WORK = 12

# ---------------------------------------------------------------------------
# 給与一覧シートの列番号 (1-indexed)
# ---------------------------------------------------------------------------
SALARY_SHEET = "給与一覧"
SALARY_DATA_START_ROW = 4
COL_S_SEQ = 2
COL_S_GRADE = 3
COL_S_YEAR = 4
COL_S_MONTH = 5
COL_S_TYPE = 6
COL_S_GROSS_TOTAL = 7
COL_S_DEDUCTION_TOTAL = 8
COL_S_NET_PAY = 9

PAYMENT_FIELDS = [
    ("基本給", 10),
    ("住宅手当", 11),
    ("前払退職金", 12),
    ("時間外勤務手当", 13),
    ("深夜手当", 14),
    ("賞与基本給", 15),
    ("特別支給", 16),
    ("その他支給", 17),
    ("基本給調整", 18),
]

DEDUCTION_FIELDS = [
    ("健康保険", 19),
    ("厚生年金", 20),
    ("雇用保険", 21),
    ("社会保険料合計", 22),
    ("所得税", 23),
    ("住民税", 24),
    ("年調過不足額", 25),
    ("その他控除額", 26),
    ("株式購入", 27),
    ("レインバース", 28),
]

ATTENDANCE_FIELDS = [
    ("所定勤務日数", 29),
    ("勤務日数", 30),
    ("欠勤日数", 31),
    ("時間外勤務時間", 32),
    ("深夜時間", 33),
    ("休日時間", 34),
    ("精算残業時間", 35),
    ("60時間超", 36),
]

COL_S_BANK_TRANSFER = 38  # 銀行振込額
COL_S_TAXABLE_AMOUNT = 39  # 課税対象額
# 「第1口座」(列37)は data-model.md のスキーマに対応フィールドが無く、
# 実データでは銀行振込額(列38)と常に同値の重複列のため保存しない。

# ---------------------------------------------------------------------------
# 統計シートの列番号 (1-indexed)
# ---------------------------------------------------------------------------
MONTHS_SHEET = "統計"
MONTHS_DATA_START_ROW = 4
COL_M_BALANCE_START = 4  # 月初金額
COL_M_BALANCE_END = 5  # 月末金額
COL_M_YEAR = 6  # 年
COL_M_MONTH = 11  # 月 ('01'..'12')
COL_M_STAR = 16  # ★
COL_M_NOTE = 17  # メモ

STAR_MARK = "★"  # ★


def num(v):
    """Excelの数値セルを int/float/None に正規化する。整数値のfloatはintへ丸める。"""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, float):
        if v.is_integer():
            return int(v)
        return v
    return v


def money(v):
    """金額(円)は必ず整数として扱う。整数化できない場合はエラーにする。"""
    if v is None:
        return None
    if isinstance(v, float):
        if not v.is_integer():
            raise ValueError(f"金額フィールドが整数でない: {v!r}")
        return int(v)
    if isinstance(v, int):
        return v
    raise ValueError(f"金額フィールドが数値でない: {v!r}")


def strp(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def load_categories(output_dir: Path):
    cat_path = output_dir / "categories.json"
    if not cat_path.exists():
        return None
    with cat_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return set(data.get("categories", {}).keys())


# ---------------------------------------------------------------------------
# transactions
# ---------------------------------------------------------------------------
def parse_transactions(ws):
    raw_rows = []
    r = TX_DATA_START_ROW
    while True:
        date_val = ws.cell(row=r, column=COL_TX_DATE).value
        if date_val is None:
            break
        raw_rows.append(
            {
                "date": strp(date_val),
                "amount": money(ws.cell(row=r, column=COL_TX_AMOUNT).value),
                "currency": strp(ws.cell(row=r, column=COL_TX_CURRENCY).value) or "JPY",
                "description": strp(ws.cell(row=r, column=COL_TX_DESCRIPTION).value) or "",
                "memo": strp(ws.cell(row=r, column=COL_TX_MEMO).value),
                "category": strp(ws.cell(row=r, column=COL_TX_CATEGORY).value) or "Uncategorized",
                "account": strp(ws.cell(row=r, column=COL_TX_ACCOUNT_NAME).value) or "",
                "work": strp(ws.cell(row=r, column=COL_TX_WORK).value) or "",
                "_row": r,
            }
        )
        r += 1

    by_year = defaultdict(list)
    for row in raw_rows:
        year = int(row["date"][:4])
        by_year[year].append(row)

    transactions_by_year = {}
    for year, rows in by_year.items():
        # 日付順(同日内は元の行順を維持する安定ソート)に並べてから連番採番
        rows_sorted = sorted(rows, key=lambda x: (x["date"], x["_row"]))
        out = []
        for i, row in enumerate(rows_sorted, start=1):
            out.append(
                {
                    "id": f"t-{year}-{i:06d}",
                    "date": row["date"],
                    "amount": row["amount"],
                    "currency": row["currency"],
                    "description": row["description"],
                    "memo": row["memo"],
                    "category": row["category"],
                    "account": row["account"],
                    "work": row["work"],
                    "isSpecial": False,
                    "specialNote": None,
                }
            )
        transactions_by_year[year] = out

    return transactions_by_year, raw_rows


# ---------------------------------------------------------------------------
# salaries
# ---------------------------------------------------------------------------
def parse_salaries(ws):
    raw_rows = []
    r = SALARY_DATA_START_ROW
    while r <= ws.max_row:
        gross = ws.cell(row=r, column=COL_S_GROSS_TOTAL).value
        year_val = ws.cell(row=r, column=COL_S_YEAR).value
        month_val = ws.cell(row=r, column=COL_S_MONTH).value
        grade_val = ws.cell(row=r, column=COL_S_GRADE).value
        # 年/月/給与・賞与区分は未到来の将来月にも下書きとして入力済みのため、
        # それだけでは実データ行かどうか判定できない。給与体系(grade)が入力されている
        # 行のみを実データとして扱う(金額が未記入の欠損レコードでもgradeがあれば含める)。
        if year_val is None or month_val is None or grade_val is None:
            r += 1
            continue

        year = int(str(year_val).strip().rstrip("年"))
        month = int(str(month_val).strip().rstrip("月"))
        s_type = strp(ws.cell(row=r, column=COL_S_TYPE).value)

        payments = {
            name: money(ws.cell(row=r, column=col).value) for name, col in PAYMENT_FIELDS
        }
        deductions = {
            name: money(ws.cell(row=r, column=col).value) for name, col in DEDUCTION_FIELDS
        }
        attendance = {
            name: num(ws.cell(row=r, column=col).value) for name, col in ATTENDANCE_FIELDS
        }

        raw_rows.append(
            {
                "year": year,
                "month": month,
                "type": s_type,
                "grade": strp(ws.cell(row=r, column=COL_S_GRADE).value),
                "grossTotal": money(gross),
                "deductionTotal": money(ws.cell(row=r, column=COL_S_DEDUCTION_TOTAL).value),
                "netPay": money(ws.cell(row=r, column=COL_S_NET_PAY).value),
                "payments": payments,
                "deductions": deductions,
                "attendance": attendance,
                "bankTransfer": money(ws.cell(row=r, column=COL_S_BANK_TRANSFER).value),
                "taxableAmount": money(ws.cell(row=r, column=COL_S_TAXABLE_AMOUNT).value),
                "note": None,
                "_row": r,
            }
        )
        r += 1

    # 同年月に給与と賞与がある場合、賞与の id に -bonus サフィックスを付与
    groups = defaultdict(list)
    for row in raw_rows:
        groups[(row["year"], row["month"])].append(row)

    salaries = []
    for row in raw_rows:
        key = (row["year"], row["month"])
        has_salary_sibling = any(
            sib["type"] == "給与" for sib in groups[key] if sib is not row
        )
        base_id = f"s-{row['year']}-{row['month']:02d}"
        if row["type"] == "賞与" and has_salary_sibling:
            sid = f"{base_id}-bonus"
        else:
            sid = base_id
        salaries.append(
            {
                "id": sid,
                "year": row["year"],
                "month": row["month"],
                "type": row["type"],
                "grade": row["grade"],
                "grossTotal": row["grossTotal"],
                "deductionTotal": row["deductionTotal"],
                "netPay": row["netPay"],
                "payments": row["payments"],
                "deductions": row["deductions"],
                "attendance": row["attendance"],
                "bankTransfer": row["bankTransfer"],
                "taxableAmount": row["taxableAmount"],
                "note": row["note"],
            }
        )

    return salaries, raw_rows


# ---------------------------------------------------------------------------
# months
# ---------------------------------------------------------------------------
def parse_months(ws):
    months = []
    r = MONTHS_DATA_START_ROW
    while r <= ws.max_row:
        balance_start = ws.cell(row=r, column=COL_M_BALANCE_START).value
        balance_end = ws.cell(row=r, column=COL_M_BALANCE_END).value
        year_val = ws.cell(row=r, column=COL_M_YEAR).value
        month_val = ws.cell(row=r, column=COL_M_MONTH).value

        if balance_start is None and balance_end is None:
            # データ未記入の将来月はスキップ
            r += 1
            continue
        if year_val is None or month_val is None:
            r += 1
            continue

        star_val = ws.cell(row=r, column=COL_M_STAR).value
        note_val = strp(ws.cell(row=r, column=COL_M_NOTE).value)
        is_special = bool(star_val and str(star_val).strip())

        month_str = str(month_val).strip()
        if month_str.isdigit():
            month_str = f"{int(month_str):02d}"

        months.append(
            {
                "month": f"{int(year_val)}-{month_str}",
                "isSpecial": is_special,
                "note": note_val,
                "balanceStart": money(balance_start),
                "balanceEnd": money(balance_end),
            }
        )
        r += 1

    return months


# ---------------------------------------------------------------------------
# 検証
# ---------------------------------------------------------------------------
def run_validation(ws_tx, transactions_by_year, raw_tx_rows, salaries, categories_known):
    checks = []

    # 1. 取引件数一致
    excel_count = len(raw_tx_rows)
    json_count = sum(len(v) for v in transactions_by_year.values())
    checks.append(
        (
            f"取引件数一致 (Excel={excel_count} / JSON={json_count})",
            excel_count == json_count,
        )
    )

    # 2. 年別件数一致
    excel_year_counts = Counter(int(row["date"][:4]) for row in raw_tx_rows)
    json_year_counts = {y: len(v) for y, v in transactions_by_year.items()}
    year_ok = dict(excel_year_counts) == json_year_counts
    checks.append(
        (
            f"年別件数一致 (Excel={dict(excel_year_counts)} / JSON={json_year_counts})",
            year_ok,
        )
    )

    # 2b. カテゴリ別件数一致(年をまたいだ全体で比較)
    excel_cat_counts = Counter(row["category"] for row in raw_tx_rows)
    json_cat_counts = Counter()
    for txs in transactions_by_year.values():
        for t in txs:
            json_cat_counts[t["category"]] += 1
    cat_ok = excel_cat_counts == json_cat_counts
    checks.append((f"カテゴリ別件数一致 (種類数 Excel={len(excel_cat_counts)} / JSON={len(json_cat_counts)})", cat_ok))

    # 3. 年ごとの金額合計一致
    excel_year_sum = defaultdict(int)
    for row in raw_tx_rows:
        excel_year_sum[int(row["date"][:4])] += row["amount"]
    sum_ok = True
    sum_detail = []
    for year, txs in transactions_by_year.items():
        json_sum = sum(t["amount"] for t in txs)
        ok = json_sum == excel_year_sum[year]
        sum_detail.append(f"{year}: Excel={excel_year_sum[year]} JSON={json_sum}")
        sum_ok = sum_ok and ok
    checks.append((f"年ごとの金額合計一致 ({'; '.join(sum_detail)})", sum_ok))

    # 4. 給与件数 + netPay整合
    salary_count_ok = len(salaries) == 56
    checks.append((f"給与件数56件 (実際={len(salaries)})", salary_count_ok))

    netpay_mismatches = []
    for s in salaries:
        if s["grossTotal"] is None or s["deductionTotal"] is None:
            # 金額未記入の欠損レコード(例: s-2023-12-bonus)。null同士なら整合とみなす。
            if s["netPay"] is not None:
                netpay_mismatches.append((s["id"], None, s["netPay"]))
            continue
        expected = s["grossTotal"] - s["deductionTotal"]
        if expected != s["netPay"]:
            netpay_mismatches.append((s["id"], expected, s["netPay"]))
    netpay_ok = len(netpay_mismatches) == 0
    detail = "" if netpay_ok else f" 不一致: {netpay_mismatches}"
    checks.append((f"netPay = grossTotal - deductionTotal 整合{detail}", netpay_ok))

    # 5. 未知カテゴリ警告
    unknown = []
    if categories_known is not None:
        used_categories = set(excel_cat_counts.keys())
        unknown = sorted(used_categories - categories_known)
    unknown_ok = len(unknown) == 0
    if categories_known is None:
        checks.append(("未知カテゴリチェック (categories.json が見つからずスキップ)", True))
    else:
        checks.append((f"未知カテゴリなし (未知={unknown})", unknown_ok))

    return checks


def main():
    parser = argparse.ArgumentParser(description="money-lens Excel移行スクリプト")
    parser.add_argument("--input", required=True, help="入力xlsxパス")
    parser.add_argument("--output", required=True, help="出力ディレクトリ (money-lens-dataのローカルクローン)")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output)
    if not input_path.exists():
        print(f"入力ファイルが見つかりません: {input_path}", file=sys.stderr)
        sys.exit(1)

    wb = openpyxl.load_workbook(str(input_path), data_only=True)

    ws_tx = wb[TX_SHEET]
    ws_salary = wb[SALARY_SHEET]
    ws_months = wb[MONTHS_SHEET]

    transactions_by_year, raw_tx_rows = parse_transactions(ws_tx)
    salaries, raw_salary_rows = parse_salaries(ws_salary)
    months = parse_months(ws_months)

    categories_known = load_categories(output_dir)

    checks = run_validation(ws_tx, transactions_by_year, raw_tx_rows, salaries, categories_known)

    print("=" * 70)
    print("検証結果")
    print("=" * 70)
    all_pass = True
    for label, ok in checks:
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_pass = False
        print(f"[{status}] {label}")
    print("=" * 70)

    if not all_pass:
        print("検証にFAILがあるため、JSONファイルは書き出しません。原因を調査してください。", file=sys.stderr)
        sys.exit(2)

    # 書き出し
    tx_dir = output_dir / "transactions"
    tx_dir.mkdir(parents=True, exist_ok=True)
    for year, txs in sorted(transactions_by_year.items()):
        out_path = tx_dir / f"{year}.json"
        with out_path.open("w", encoding="utf-8") as f:
            json.dump({"year": year, "transactions": txs}, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"書き出し: {out_path} ({len(txs)}件)")

    salaries_path = output_dir / "salaries.json"
    with salaries_path.open("w", encoding="utf-8") as f:
        json.dump({"salaries": salaries}, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"書き出し: {salaries_path} ({len(salaries)}件)")

    months_path = output_dir / "months.json"
    with months_path.open("w", encoding="utf-8") as f:
        json.dump({"months": months}, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"書き出し: {months_path} ({len(months)}件)")

    print("すべての検証がPASSし、JSONを書き出しました。")


if __name__ == "__main__":
    main()
