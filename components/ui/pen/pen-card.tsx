import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The pen design-file card recipe: one white surface, generous radius,
 * a whisper of shadow, and a title/caption head with an actions slot on the right.
 */
export function PenCard({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_2px_4px_rgb(0_0_0/0.04)]", className)}>{children}</section>;
}

export function PenCardHead({ title, caption, actions }: { title: string; caption?: string; actions?: ReactNode }) {
  return <header className="flex items-start justify-between gap-4">
    <div className="min-w-0 space-y-1">
      <h2 className="text-md font-semibold text-foreground">{title}</h2>
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-4">{actions}</div>}
  </header>;
}
