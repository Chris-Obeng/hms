import type { ReactNode } from "react";
import { Card } from "@heroui/react";
import { cn } from "@/lib/utils";

/**
 * Page card for settings, payments and night audit: HeroUI Card with the same
 * surface as the front desk (hairline border, faint shadow, 24px radius).
 */
export function PenCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Card
      className={cn(
        "gap-4 rounded-3xl border border-border/60 p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-6",
        className
      )}
    >
      {children}
    </Card>
  );
}

export function PenCardHead({ title, caption, actions }: { title: string; caption?: string; actions?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
