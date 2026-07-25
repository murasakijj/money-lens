import { useState } from "react";
import type { MonthMeta } from "../../lib/aggregate";

interface Props {
  existingMonths: string[];
  defaultMonth: string; // "YYYY-MM"
  onClose: () => void;
  onSave: (entry: MonthMeta) => void;
}

/**
 * 月末残高の手動入力フォーム。既存の月を選ぶと上書き（更新）、
 * 新しい月を入力すると追加になる（`upsertMonthMeta`が判定する）。
 */
export default function AddBalanceModal({ existingMonths, defaultMonth, onClose, onSave }: Props) {
  const [month, setMonth] = useState(defaultMonth);
  const [balanceStart, setBalanceStart] = useState("");
  const [balanceEnd, setBalanceEnd] = useState("");
  const [isSpecial, setIsSpecial] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isUpdate = existingMonths.includes(month);

  function handleSubmit() {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setError("月はYYYY-MM形式で入力してください。");
      return;
    }
    const start = Number(balanceStart);
    const end = Number(balanceEnd);
    if (balanceStart.trim() === "" || !Number.isInteger(start)) {
      setError("月初残高は整数で入力してください。");
      return;
    }
    if (balanceEnd.trim() === "" || !Number.isInteger(end)) {
      setError("月末残高は整数で入力してください。");
      return;
    }

    const entry: MonthMeta = {
      month,
      isSpecial,
      note: isSpecial ? note.trim() || null : null,
      balanceStart: start,
      balanceEnd: end,
    };
    onSave(entry);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="月末残高を入力"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>月末残高を入力</h3>

        {error && <p role="alert">{error}</p>}

        <label className="modal-field">
          <span>月</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        {isUpdate && <p className="empty-note">既存の{month}のデータを上書きします。</p>}

        <div className="modal-field-row">
          <label className="modal-field">
            <span>月初残高（円）</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              value={balanceStart}
              onChange={(e) => setBalanceStart(e.target.value)}
            />
          </label>
          <label className="modal-field">
            <span>月末残高（円）</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              value={balanceEnd}
              onChange={(e) => setBalanceEnd(e.target.value)}
            />
          </label>
        </div>

        <label className="modal-field modal-field-checkbox">
          <input
            type="checkbox"
            checked={isSpecial}
            onChange={(e) => setIsSpecial(e.target.checked)}
          />
          <span>★ 特別出費月</span>
        </label>

        {isSpecial && (
          <label className="modal-field">
            <span>メモ</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: 家(東横建設100万円)"
            />
          </label>
        )}

        <div className="modal-actions">
          <div />
          <div className="modal-actions-right">
            <button type="button" onClick={onClose}>
              キャンセル
            </button>
            <button type="button" className="primary-button" onClick={handleSubmit}>
              {isUpdate ? "上書き保存" : "追加"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
