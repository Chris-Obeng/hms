"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "@heroui/react";

import { cn } from "@/lib/utils";
import { getStatusLabel } from "@/lib/booking-status";

const PILL_STYLES: Record<string, string> = {
  checked_in:
    "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25",
  confirmed:
    "bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25",
  pending:
    "bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25",
  cancelled:
    "bg-red-500/10 text-red-700 dark:text-red-300 ring-red-500/25",
  no_show:
    "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/25",
  checked_out:
    "bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25",
};

const DOT_STYLES: Record<string, string> = {
  confirmed: "bg-sky-500",
  checked_in: "bg-emerald-500",
  checked_out: "bg-slate-400",
  cancelled: "bg-red-500",
  no_show: "bg-rose-500",
  pending: "bg-violet-500",
};

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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset",
        PILL_STYLES[key] ?? "bg-muted text-muted-foreground ring-border",
        className
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", DOT_STYLES[key] ?? "bg-slate-400")}
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
        "group inline-flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-lg bg-muted/70 px-2 transition-colors",
        "hover:bg-muted active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <span className="truncate font-mono text-[11px] font-medium tracking-tight text-muted-foreground">
        {reference}
      </span>
      {copied ? (
        <Check className="size-3 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="size-3 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
      )}
    </button>
  );
}
