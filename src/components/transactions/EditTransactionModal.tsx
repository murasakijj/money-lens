import { useState } from "react";
import type { CategoriesData, Transaction } from "../../lib/aggregate";
import { groupedCategoryOptions, type TransactionUpdate } from "../../lib/transactionEdits";
import { formatYen } from "../../lib/format";

interface Props {
  transaction: Transaction;
  categories: CategoriesData;
  onClose: () => void;
  onSave: (patch: TransactionUpdate) => void;
  onDelete: () => void;
}

/**
 * 明細編集モーダル。docs/ui.md の範囲どおり、変更できるのは
 * カテゴリ・★特別出費フラグ・特別出費メモ・削除のみ（金額や日付は変更不可）。
 */
export default function EditTransactionModal({
  transaction,
  categories,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [category, setCategory] = useState(transaction.category);
  const [isSpecial, setIsSpecial] = useState(transaction.isSpecial);
  const [specialNote, setSpecialNote] = useState(transaction.specialNote ?? "");
  const groups = groupedCategoryOptions(categories);

  function handleSave() {
    onSave({
      category,
      isSpecial,
      specialNote: isSpecial ? specialNote.trim() || null : null,
    });
    onClose();
  }

  function handleDelete() {
    if (!window.confirm("この明細を削除しますか？（保存操作をするまで確定しません）")) return;
    onDelete();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="明細を編集"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>明細を編集</h3>
        <dl className="modal-summary">
          <div>
            <dt>日付</dt>
            <dd>{transaction.date}</dd>
          </div>
          <div>
            <dt>説明</dt>
            <dd>{transaction.description}</dd>
          </div>
          <div>
            <dt>金額</dt>
            <dd className={transaction.amount >= 0 ? "amount-positive" : "amount-negative"}>
              {formatYen(transaction.amount)}
            </dd>
          </div>
        </dl>

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
          <button type="button" className="danger-button" onClick={handleDelete}>
            削除
          </button>
          <div className="modal-actions-right">
            <button type="button" onClick={onClose}>
              キャンセル
            </button>
            <button type="button" className="primary-button" onClick={handleSave}>
              このセッションに反映
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
