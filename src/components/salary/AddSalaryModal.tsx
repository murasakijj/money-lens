import { useState } from "react";
import {
  createSalaryId,
  type SalaryAttendance,
  type SalaryDeductions,
  type SalaryEntry,
  type SalaryPayments,
  type SalaryType,
} from "../../lib/salary";

interface Props {
  existingIds: string[];
  knownGrades: string[];
  onClose: () => void;
  onAdd: (entry: SalaryEntry) => void;
}

const PAYMENT_FIELDS: { key: keyof SalaryPayments; label: string }[] = [
  { key: "基本給", label: "基本給" },
  { key: "住宅手当", label: "住宅手当" },
  { key: "前払退職金", label: "前払退職金" },
  { key: "時間外勤務手当", label: "時間外勤務手当" },
  { key: "深夜手当", label: "深夜手当" },
  { key: "賞与基本給", label: "賞与基本給" },
  { key: "特別支給", label: "特別支給" },
  { key: "その他支給", label: "その他支給" },
  { key: "基本給調整", label: "基本給調整" },
];

const DEDUCTION_FIELDS: { key: keyof SalaryDeductions; label: string }[] = [
  { key: "健康保険", label: "健康保険" },
  { key: "厚生年金", label: "厚生年金" },
  { key: "雇用保険", label: "雇用保険" },
  { key: "社会保険料合計", label: "社会保険料合計" },
  { key: "所得税", label: "所得税" },
  { key: "住民税", label: "住民税" },
  { key: "年調過不足額", label: "年調過不足額" },
  { key: "その他控除額", label: "その他控除額" },
  { key: "株式購入", label: "株式購入" },
  { key: "レインバース", label: "レインバース" },
];

const ATTENDANCE_FIELDS: { key: keyof SalaryAttendance; label: string }[] = [
  { key: "所定勤務日数", label: "所定勤務日数" },
  { key: "勤務日数", label: "勤務日数" },
  { key: "欠勤日数", label: "欠勤日数" },
  { key: "時間外勤務時間", label: "時間外勤務時間" },
  { key: "深夜時間", label: "深夜時間" },
  { key: "休日時間", label: "休日時間" },
  { key: "精算残業時間", label: "精算残業時間" },
  { key: "60時間超", label: "60時間超" },
];

type TextState = Record<string, string>;

function emptyTextState(fields: { key: string }[]): TextState {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

const INVALID = Symbol("invalid");

/** "" -> null、整数以外はエラー扱い（呼び出し側でチェック）。 */
function parseOptionalInt(text: string): number | null | typeof INVALID {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return INVALID;
  return n;
}

function buildRecord<K extends string>(
  fields: { key: K; label: string }[],
  state: TextState,
): { record: Record<K, number | null>; invalidLabel: string | null } {
  const record = {} as Record<K, number | null>;
  for (const f of fields) {
    const parsed = parseOptionalInt(state[f.key] ?? "");
    if (parsed === INVALID) {
      return { record, invalidLabel: f.label };
    }
    record[f.key] = parsed;
  }
  return { record, invalidLabel: null };
}

/**
 * 給与明細の手動追加フォーム（Excelの列構成に準拠）。
 * 上部の必須項目（年月・種別・支給合計等）以外はすべて任意入力（空欄はnull）。
 */
export default function AddSalaryModal({ existingIds, knownGrades, onClose, onAdd }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [type, setType] = useState<SalaryType>("給与");
  const [grade, setGrade] = useState(knownGrades[knownGrades.length - 1] ?? "");
  const [grossTotal, setGrossTotal] = useState("");
  const [deductionTotal, setDeductionTotal] = useState("");
  const [netPay, setNetPay] = useState("");
  const [bankTransfer, setBankTransfer] = useState("");
  const [taxableAmount, setTaxableAmount] = useState("");
  const [note, setNote] = useState("");

  const [payments, setPayments] = useState<TextState>(() => emptyTextState(PAYMENT_FIELDS));
  const [deductions, setDeductions] = useState<TextState>(() => emptyTextState(DEDUCTION_FIELDS));
  const [attendance, setAttendance] = useState<TextState>(() => emptyTextState(ATTENDANCE_FIELDS));

  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (month < 1 || month > 12) {
      setError("月は1〜12で入力してください。");
      return;
    }
    if (!grade.trim()) {
      setError("給与体系（grade）を入力してください。");
      return;
    }

    const requiredEntries: [string, string][] = [
      ["支給合計", grossTotal],
      ["控除合計", deductionTotal],
      ["差引支給額（手取り）", netPay],
      ["銀行振込額", bankTransfer],
    ];
    for (const [label, text] of requiredEntries) {
      const parsed = parseOptionalInt(text);
      if (parsed === null || parsed === INVALID) {
        setError(`${label}は整数で入力してください。`);
        return;
      }
    }

    const taxableParsed = parseOptionalInt(taxableAmount);
    if (taxableParsed === INVALID) {
      setError("課税対象額は整数で入力してください。");
      return;
    }

    const paymentsResult = buildRecord(PAYMENT_FIELDS, payments);
    if (paymentsResult.invalidLabel) {
      setError(`支給「${paymentsResult.invalidLabel}」は整数で入力してください。`);
      return;
    }
    const deductionsResult = buildRecord(DEDUCTION_FIELDS, deductions);
    if (deductionsResult.invalidLabel) {
      setError(`控除「${deductionsResult.invalidLabel}」は整数で入力してください。`);
      return;
    }
    const attendanceResult = buildRecord(ATTENDANCE_FIELDS, attendance);
    if (attendanceResult.invalidLabel) {
      setError(`勤怠「${attendanceResult.invalidLabel}」は整数で入力してください。`);
      return;
    }

    const entry: SalaryEntry = {
      id: createSalaryId(year, month, type, existingIds),
      year,
      month,
      type,
      grade: grade.trim(),
      grossTotal: Number(grossTotal),
      deductionTotal: Number(deductionTotal),
      netPay: Number(netPay),
      payments: paymentsResult.record,
      deductions: deductionsResult.record,
      attendance: attendanceResult.record,
      bankTransfer: Number(bankTransfer),
      taxableAmount: taxableParsed,
      note: note.trim() || null,
    };
    onAdd(entry);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="給与明細を手動追加"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>給与明細を手動追加</h3>

        {error && <p role="alert">{error}</p>}

        <div className="modal-field modal-field-radio">
          <span>種別</span>
          <label>
            <input
              type="radio"
              name="salary-type"
              checked={type === "給与"}
              onChange={() => setType("給与")}
            />
            給与
          </label>
          <label>
            <input
              type="radio"
              name="salary-type"
              checked={type === "賞与"}
              onChange={() => setType("賞与")}
            />
            賞与
          </label>
        </div>

        <div className="modal-field-row">
          <label className="modal-field">
            <span>年</span>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <label className="modal-field">
            <span>月</span>
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </label>
        </div>

        <label className="modal-field">
          <span>給与体系（grade）</span>
          <input
            type="text"
            list="grade-options"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="例: ML7"
          />
          <datalist id="grade-options">
            {knownGrades.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>

        <fieldset className="salary-fieldset">
          <legend>合計（必須）</legend>
          <div className="modal-field-row">
            <label className="modal-field">
              <span>支給合計</span>
              <input
                type="number"
                value={grossTotal}
                onChange={(e) => setGrossTotal(e.target.value)}
              />
            </label>
            <label className="modal-field">
              <span>控除合計</span>
              <input
                type="number"
                value={deductionTotal}
                onChange={(e) => setDeductionTotal(e.target.value)}
              />
            </label>
          </div>
          <div className="modal-field-row">
            <label className="modal-field">
              <span>差引支給額（手取り）</span>
              <input type="number" value={netPay} onChange={(e) => setNetPay(e.target.value)} />
            </label>
            <label className="modal-field">
              <span>銀行振込額</span>
              <input
                type="number"
                value={bankTransfer}
                onChange={(e) => setBankTransfer(e.target.value)}
              />
            </label>
          </div>
          <label className="modal-field">
            <span>課税対象額（任意）</span>
            <input
              type="number"
              value={taxableAmount}
              onChange={(e) => setTaxableAmount(e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="salary-fieldset">
          <legend>支給内訳（任意）</legend>
          <div className="salary-fieldset-grid">
            {PAYMENT_FIELDS.map((f) => (
              <label className="modal-field" key={f.key}>
                <span>{f.label}</span>
                <input
                  type="number"
                  value={payments[f.key]}
                  onChange={(e) => setPayments((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="salary-fieldset">
          <legend>控除内訳（任意）</legend>
          <div className="salary-fieldset-grid">
            {DEDUCTION_FIELDS.map((f) => (
              <label className="modal-field" key={f.key}>
                <span>{f.label}</span>
                <input
                  type="number"
                  value={deductions[f.key]}
                  onChange={(e) => setDeductions((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="salary-fieldset">
          <legend>勤怠（任意）</legend>
          <div className="salary-fieldset-grid">
            {ATTENDANCE_FIELDS.map((f) => (
              <label className="modal-field" key={f.key}>
                <span>{f.label}</span>
                <input
                  type="number"
                  value={attendance[f.key]}
                  onChange={(e) => setAttendance((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <label className="modal-field">
          <span>メモ（任意）</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="modal-actions">
          <div />
          <div className="modal-actions-right">
            <button type="button" onClick={onClose}>
              キャンセル
            </button>
            <button type="button" className="primary-button" onClick={handleSubmit}>
              追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
