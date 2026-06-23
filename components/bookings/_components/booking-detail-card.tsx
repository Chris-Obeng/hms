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
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3 text-muted-foreground/50" />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
