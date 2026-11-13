"use client";

import * as React from "react";
import { Button } from "@heroui/react";

// Shared editable-notes control: a textarea with a live character count and
// Cancel / Save actions. Used for guest notes and booking internal notes.

interface NotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  /** Accessible label for the textarea. */
  label: string;
  placeholder?: string;
  maxLength?: number;
}

export function NotesEditor({
  value,
  onChange,
  onCancel,
  onSave,
  saving,
  label,
  placeholder,
  maxLength = 2000,
}: NotesEditorProps) {
  const countId = React.useId();
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        maxLength={maxLength}
        autoFocus
        aria-label={label}
        aria-describedby={countId}
        className="w-full resize-none rounded-xl border border-border/60 bg-background px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
      />
      <div className="flex items-center justify-between">
        <span id={countId} aria-live="polite" className="text-2xs tabular-nums text-muted-foreground">
          {value.length}/{maxLength}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="tertiary" onPress={onCancel} className="h-8 rounded-lg text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onPress={onSave}
            isPending={saving}
            className="h-8 rounded-lg bg-foreground text-xs font-semibold text-background hover:bg-foreground/90"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
