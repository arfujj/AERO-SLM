import { useEffect, useRef, useState } from "react";

interface RuledLineInputProps {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  placeholders?: string[];
  expandToPlaceholderCount?: boolean;
  minRows?: number;
  addLabel?: string;
}

export function RuledLineInput({
  id,
  value,
  onChange,
  placeholder,
  placeholders = [],
  expandToPlaceholderCount = false,
  minRows = 1,
  addLabel = "Add line"
}: RuledLineInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [activeHintIndex, setActiveHintIndex] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const rowCount = Math.max(
    minRows,
    value.length || 0,
    expandToPlaceholderCount ? placeholders.length || 0 : 0
  );
  const rows = Array.from({ length: rowCount }, (_, index) => value[index] ?? "");

  useEffect(() => {
    if (placeholders.length <= 1) {
      return;
    }

    const hasEmptyRows = rows.some((row) => !row.trim());
    if (!hasEmptyRows) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setHintVisible(false);

      window.setTimeout(() => {
        setActiveHintIndex((current) => (current + 1) % placeholders.length);
        setHintVisible(true);
      }, 220);
    }, 2400);

    return () => window.clearInterval(intervalId);
  }, [placeholders, rows]);

  function updateRow(index: number, nextValue: string) {
    const nextRows = [...rows];
    nextRows[index] = nextValue;
    onChange(nextRows);
  }

  function addRow() {
    const nextRows = [...rows, ""];
    onChange(nextRows);
    window.requestAnimationFrame(() => {
      inputRefs.current[nextRows.length - 1]?.focus();
    });
  }

  function removeRow(index: number) {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange(nextRows.length > 0 ? nextRows : [""]);
  }

  return (
    <div className="ruled-input-block">
      <div className="ruled-input-sheet">
        {rows.map((rowValue, index) => (
          <div key={`${id}-${index}`} className="ruled-input-line">
            <span className="ruled-input-index">{index + 1}</span>
            <label className="ruled-input-field-wrap" htmlFor={index === 0 ? id : undefined}>
              <input
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                className="ruled-input-row"
                id={index === 0 ? id : undefined}
                type="text"
                value={rowValue}
                onChange={(event) => updateRow(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    inputRefs.current[index + 1]?.focus();
                  }
                }}
                placeholder=""
              />
              {!rowValue.trim() ? (
                <span className={`ruled-input-hint ${hintVisible ? "ruled-input-hint-visible" : ""}`}>
                  {placeholders.length > 0
                    ? placeholders[(activeHintIndex + index) % placeholders.length]
                    : index === 0
                      ? placeholder
                      : ""}
                </span>
              ) : null}
            </label>
            <button
              className="ruled-input-remove"
              type="button"
              onClick={() => removeRow(index)}
              disabled={rows.length === 1}
              aria-label={`Delete line ${index + 1}`}
              title={rows.length === 1 ? "Keep at least one line" : `Delete line ${index + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button className="button button-secondary button-small ruled-input-add" type="button" onClick={addRow}>
        + {addLabel}
      </button>
    </div>
  );
}
