"use client";

import * as React from "react";

export function DetailCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 space-y-1 border-l border-border/60 py-1 pl-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3 text-muted-foreground/50" />
        <span className="text-2xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="truncate text-sm font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}
