import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Shared staff-surface header: consistent 20px→24px title, quiet single-line
 * metadata/count, and right-aligned primary actions across mobile and desktop.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[24px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

interface EmptyStatePanelProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Quiet, zero-bloat empty state shared across tables, lists, and panels.
 */
export function EmptyStatePanel({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStatePanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="mb-3 grid size-11 place-items-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground"
      >
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  );
}
