"use client";

import * as React from "react";
import { SearchField } from "@heroui/react";

import { cn } from "@/lib/utils";

interface TableSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}

/**
 * Shared table search: 44px touch height on mobile with 16px input text (prevents
 * iOS Safari auto-zoom), compact 36px height on sm+. Does not hijack "/" so global
 * DashboardSearch keeps its single keyboard shortcut.
 */
export function TableSearchField({
  value,
  onChange,
  ariaLabel,
  placeholder = "Search…",
  className,
}: TableSearchFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <SearchField
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      className={cn("min-w-0 max-w-sm flex-1", className)}
    >
      <SearchField.Group className="h-11 rounded-xl border-border/60 bg-background sm:h-10">
        <SearchField.SearchIcon />
        <SearchField.Input
          ref={inputRef}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (value) onChange("");
              else inputRef.current?.blur();
            }
          }}
          className="text-base sm:text-sm"
        />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}
