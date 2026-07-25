import { formatMonthLabel } from "../../lib/format";

interface Props {
  month: string;
  onPrev: () => void;
  onNext: () => void;
}

export default function MonthNav({ month, onPrev, onNext }: Props) {
  return (
    <nav className="month-nav" aria-label="月選択">
      <button type="button" onClick={onPrev} aria-label="前月">
        ‹
      </button>
      <h2>{formatMonthLabel(month)}</h2>
      <button type="button" onClick={onNext} aria-label="次月">
        ›
      </button>
    </nav>
  );
}
