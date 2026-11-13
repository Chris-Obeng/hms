"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, Chip, toast } from "@heroui/react";

import { cn } from "@/lib/utils";
import { getStatusLabel, STATUS_COLORS, STATUS_DOT_FALLBACK } from "@/lib/booking-status";

type ChipColor = "default" | "accent" | "success" | "warning" | "danger";

const STATUS_CHIP_COLOR: Record<string, ChipColor> = {
  confirmed: "accent",
  checked_in: "success",
  checked_out: "default",
  pending: "warning",
  cancelled: "danger",
  no_show: "danger",
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
    <Chip
      size="sm"
      variant="soft"
      color={STATUS_CHIP_COLOR[key] ?? "default"}
      className={cn("gap-1 font-medium", className)}
    >
      <span aria-hidden className={cn("size-2 rounded-full", STATUS_COLORS[key] ?? STATUS_DOT_FALLBACK)} />
      <Chip.Label>{getStatusLabel(key)}</Chip.Label>
    </Chip>
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
    <Button
      size="sm"
      variant="ghost"
      onPress={copy}
      aria-label={`Copy reference ${reference}`}
      className={cn(
        "group h-6 min-w-0 gap-1 rounded-md px-2 text-muted-foreground md:h-6",
        className
      )}
    >
      <span className="truncate font-mono text-2xs font-medium tracking-tight">{reference}</span>
      {copied ? (
        <Check className="size-3 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" />
      )}
    </Button>
  );
}
