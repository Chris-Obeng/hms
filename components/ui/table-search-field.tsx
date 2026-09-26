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
  /** Key that focuses the field from anywhere on the page. */
  shortcut?: string;
}

function isTypingTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable
  );
}

// Shared table search: consistent 44px-touch/36px-dense sizing, a "/" focus
// shortcut, and a subtle desktop hint. Behaviour is identical across tables.
export function TableSearchField({
  value,
  onChange,
  ariaLabel,
  placeholder = "Search…",
  className,
  shortcut = "/",
}: TableSearchFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === shortcut && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcut]);

  return (
    <SearchField
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      className={cn("max-w-sm flex-1", className)}
    >
      <SearchField.Group className="h-11 rounded-xl border-border/60 bg-background sm:h-9">
        <SearchField.SearchIcon />
        <SearchField.Input ref={inputRef} placeholder={placeholder} className="text-sm" />
        {!value && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none mr-2 hidden select-none items-center rounded border border-border/70 bg-muted px-1.5 font-sans text-[11px] font-medium text-muted-foreground sm:inline-flex"
          >
            {shortcut}
          </kbd>
        )}
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}
