"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "@heroui/react";

import { cn } from "@/lib/utils";
import {
  getStatusLabel,
  STATUS_COLORS,
  STATUS_DOT_FALLBACK,
  STATUS_PILL_CLASSES,
  STATUS_PILL_FALLBACK,
} from "@/lib/booking-status";

export function BookingStatusPill({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const key = status || "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-2xs font-semibold capitalize ring-1 ring-inset",
        STATUS_PILL_CLASSES[key] ?? STATUS_PILL_FALLBACK,
        className
      )}
    >
      <span
        aria-hidden
        className={cn("size-2 rounded-full", STATUS_COLORS[key] ?? STATUS_DOT_FALLBACK)}
      />
      {getStatusLabel(key)}
    </span>
  );
}

export function ReferenceChip({
  reference,
  className,
}: {
  reference: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      toast.success("Reference copied");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.danger("Could not copy reference");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy reference"
      aria-label={`Copy reference ${reference}`}
      className={cn(
        "group inline-flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <span className="truncate font-mono text-2xs font-medium tracking-tight">
        {reference}
      </span>
      {copied ? (
        <Check className="size-3 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}
