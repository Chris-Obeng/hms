"use client";

import { useState, useId, type ChangeEvent, type KeyboardEvent } from "react";
import { Minus, Plus } from "lucide-react";

interface RoomStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  hint?: string;
}

export function RoomStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  label = "Number of rooms",
  hint,
}: RoomStepperProps) {
  const inputId = useId();
  const [draftText, setDraftText] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.floor(n)));

  const decrement = () => {
    setDraftText(null);
    if (value > min) onChange(value - 1);
  };

  const increment = () => {
    setDraftText(null);
    if (value < max) onChange(value + 1);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
    setDraftText(digits);
    if (digits !== "") {
      const parsed = Number(digits);
      if (Number.isFinite(parsed) && parsed >= min) {
        onChange(clamp(parsed));
      }
    }
  };

  const commitDraft = () => {
    if (draftText !== null) {
      const parsed = Number(draftText);
      onChange(Number.isFinite(parsed) ? clamp(parsed) : min);
    }
    setDraftText(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      increment();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      decrement();
    } else if (e.key === "Enter") {
      commitDraft();
    }
  };

  const shownValue = draftText !== null ? draftText : String(value);

  return (
    <div className="ob-field">
      <div className="ob-label-row">
        <label htmlFor={inputId} className="ob-label">
          {label}
        </label>
      </div>

      <div className="ob-number-shell">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
          value={shownValue}
          onChange={handleInputChange}
          onBlur={commitDraft}
          onKeyDown={handleKeyDown}
          className="ob-number-input"
        />
        <span className="ob-number-unit" aria-hidden="true">
          {value === 1 ? "room" : "rooms"}
        </span>
        <div className="ob-number-actions">
          <button
            type="button"
            onClick={decrement}
            disabled={value <= min}
            aria-label="Decrease room count"
            className="ob-number-btn"
          >
            <Minus size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={increment}
            disabled={value >= max}
            aria-label="Increase room count"
            className="ob-number-btn"
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>

      {hint && (
        <p id={`${inputId}-hint`} className="ob-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
