import { useState } from "react";
import type { Transaction, CategoriesData } from "../../lib/aggregate";
import { createManualId, groupedCategoryOptions } from "../../lib/transactionEdits";

interface Props {
  year: number;
  defaultDate: string; // "YYYY-MM-DD"
  categories: CategoriesData;
  accounts: string[];
  existingIds: string[];
  onClose: () => void;
  onAdd: (t: Transaction) => void;
}

type AmountType = "expense" | "income";

/**
 * 手動追加モーダル（現金支出などCSVに乗らない分の入力用）。
 * work・currency はUIに出さず固定値（"Personal" / "JPY"）で登録する。
 */
export default function AddTransactionModal({
  year,
  defaultDate,
  categories,
  accounts,
  existingIds,
  onClose,
  onAdd,
}: Props) {
  const groups = groupedCategoryOptions(categories);
  const firstCategory = groups[0]?.options[0]?.key ?? "";

  const [date, setDate] = useState(defaultDate);
  const [amountType, setAmountType] = useState<AmountType>("expense");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [memo, setMemo] = useState("");
  const [category, setCategory] = useState(firstCategory);
  const [account, setAccount] = useState(accounts[0] ?? "");
  const [isSpecial, setIsSpecial] = useState(false);
  const [specialNote, setSpecialNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const amountAbs = Number(amountText);
    if (!Number.isInteger(amountAbs) || amountAbs <= 0) {
      setError("金額は1円以上の整数で入力してください。");
      return;
    }
    if (date.slice(0, 4) !== String(year)) {
      setError(`日付は${year}年内で入力してください（現在${year}年分の明細を表示中）。`);
      return;
    }
    if (!description.trim()) {
      setError("説明を入力してください。");
      return;
    }
    if (!category) {
      setError("カテゴリを選択してください。");
      return;
    }
    if (!account.trim()) {
      setError("口座を入力してください。");
      return;
    }

    const amount = amountType === "expense" ? -amountAbs : amountAbs;
    const t: Transaction = {
      id: createManualId(year, existingIds),
      date,
      amount,
      currency: "JPY",
      description: description.trim(),
      memo: memo.trim() || null,
      category,
      account: account.trim(),
      work: "Personal",
      isSpecial,
      specialNote: isSpecial ? specialNote.trim() || null : null,
    };
    onAdd(t);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="明細を手動追加"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>明細を手動追加</h3>

        {error && <p role="alert">{error}</p>}

        <label className="modal-field">
          <span>日付</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className="modal-field modal-field-radio">
          <span>種別</span>
          <label>
            <input
              type="radio"
              name="amount-type"
              checked={amountType === "expense"}
              onChange={() => setAmountType("expense")}
            />
            支出
          </label>
          <label>
            <input
              type="radio"
              name="amount-type"
              checked={amountType === "income"}
              onChange={() => setAmountType("income")}
            />
            収入
          </label>
        </div>

        <label className="modal-field">
          <span>金額（円）</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="例: 1500"
          />
        </label>

        <label className="modal-field">
          <span>説明</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例: 現金で夕食"
          />
        </label>

        <label className="modal-field">
          <span>メモ（任意）</span>
          <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>

        <label className="modal-field">
          <span>カテゴリ</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {groups.map(({ group, options }) => (
              <optgroup key={group.id} label={group.label}>
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="modal-field">
          <span>口座</span>
          <input
            type="text"
            list="account-options"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          />
          <datalist id="account-options">
            {accounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>

        <label className="modal-field modal-field-checkbox">
          <input
            type="checkbox"
            checked={isSpecial}
            onChange={(e) => setIsSpecial(e.target.checked)}
          />
          <span>★ 特別出費</span>
        </label>

        {isSpecial && (
          <label className="modal-field">
            <span>特別出費メモ</span>
            <input
              type="text"
              value={specialNote}
              onChange={(e) => setSpecialNote(e.target.value)}
              placeholder="例: 旅行代"
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
              このセッションに追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
