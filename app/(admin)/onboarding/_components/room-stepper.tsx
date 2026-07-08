"use client";

import { type KeyboardEvent } from "react";
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
  label = "Total Rooms",
  hint,
}: RoomStepperProps) {
  const decrement = () => {
    if (value > min) onChange(value - 1);
  };

  const increment = () => {
    if (value < max) onChange(value + 1);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      increment();
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      decrement();
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(min);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(max);
    }
  };

  return (
    <div className="onboarding-form-group">
      <label className="onboarding-label">{label}</label>

      <div
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={label}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="room-stepper-wrapper"
      >
        <button
          type="button"
          onClick={decrement}
          disabled={value <= min}
          aria-label="Decrease room count"
          className="room-stepper-button"
        >
          <Minus size={14} strokeWidth={2} aria-hidden="true" />
        </button>

        <div className="room-stepper-value">
          <span className="room-stepper-number">{value}</span>
          <span className="room-stepper-unit">{value === 1 ? "room" : "rooms"}</span>
        </div>

        <button
          type="button"
          onClick={increment}
          disabled={value >= max}
          aria-label="Increase room count"
          className="room-stepper-button"
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {hint && <p className="onboarding-hint">{hint}</p>}
    </div>
  );
}
