"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  className,
}: NumberStepperProps) {
  const [isIncrementing, setIsIncrementing] = React.useState(false);
  const [isDecrementing, setIsDecrementing] = React.useState(false);

  const handleIncrement = () => {
    if (value < max) {
      setIsIncrementing(true);
      onChange(value + 1);
      setTimeout(() => setIsIncrementing(false), 200);
    }
  };

  const handleDecrement = () => {
    if (value > min) {
      setIsDecrementing(true);
      onChange(value - 1);
      setTimeout(() => setIsDecrementing(false), 200);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium text-foreground block">
          {label}
        </label>
      )}
      <div className="relative flex items-center h-12 border-2 border-border rounded-xl overflow-hidden bg-background shadow-sm hover:border-border/80 transition-colors">
        {/* Decrement Button */}
        <button
          type="button"
          onClick={handleDecrement}
          disabled={value <= min}
          className={cn(
            "h-full w-12 flex items-center justify-center transition-all duration-200 border-r-2 border-border",
            "hover:bg-primary/10 active:bg-primary/20 active:scale-95",
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
          )}
        >
          <Minus className={cn(
            "size-5 text-foreground transition-transform",
            isDecrementing && "scale-75"
          )} />
        </button>

        {/* Value Display with Animation */}
        <div className="flex-1 h-full flex items-center justify-center overflow-hidden">
          <div
            key={value}
            className={cn(
              "text-2xl font-bold tabular-nums text-foreground",
              "animate-in fade-in zoom-in duration-200"
            )}
          >
            {value}
          </div>
        </div>

        {/* Increment Button */}
        <button
          type="button"
          onClick={handleIncrement}
          disabled={value >= max}
          className={cn(
            "h-full w-12 flex items-center justify-center transition-all duration-200 border-l-2 border-border",
            "hover:bg-primary/10 active:bg-primary/20 active:scale-95",
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
          )}
        >
          <Plus className={cn(
            "size-5 text-foreground transition-transform",
            isIncrementing && "scale-75"
          )} />
        </button>

        {/* Progress indicator - shows relative position */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/30">
          <div
            className="h-full bg-primary/60 transition-all duration-300 ease-out"
            style={{
              width: `${((value - min) / (max - min)) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
