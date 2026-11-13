"use client";

import * as React from "react";
import { LayoutGrid, List } from "lucide-react";
import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import type { Key } from "@heroui/react";

import { cn } from "@/lib/utils";

export type ViewMode = "table" | "grid";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

// Segmented list/grid switcher shared across data tables. Icon-only, keyboard +
// screen-reader ready via HeroUI. Desktop-only — mobile always renders cards.
export function ViewModeToggle({ value, onChange, className }: ViewModeToggleProps) {
  function handleSelect(keys: "all" | Set<Key>) {
    const first = keys instanceof Set && keys.size > 0 ? [...keys][0] : null;
    if (first === "table" || first === "grid") onChange(first);
  }

  return (
    <ToggleButtonGroup
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={new Set([value])}
      onSelectionChange={handleSelect}
      aria-label="View mode"
      className={cn("hidden h-10 shrink-0 rounded-xl md:flex", className)}
    >
      <ToggleButton isIconOnly id="table" size="sm" aria-label="List view" className="size-10">
        <List className="size-4" />
      </ToggleButton>
      <ToggleButton isIconOnly id="grid" size="sm" aria-label="Grid view" className="size-10">
        <ToggleButtonGroup.Separator />
        <LayoutGrid className="size-4" />
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
