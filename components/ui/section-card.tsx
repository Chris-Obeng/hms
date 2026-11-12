"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A quiet panel: heading, optional one-line caption, optional trailing action, content. */
export function SectionCard({ title, caption, action, children, className, bodyClassName }: {
  title: string;
  caption?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const id = useId();
  return <section className={cn("card-default shadow-none min-w-0", className)} aria-labelledby={id}>
    <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
      <div className="min-w-0">
        <h2 id={id} className="text-section">{title}</h2>
        {caption && <p className="mt-1 text-caption text-muted-foreground">{caption}</p>}
      </div>
      {action}
    </header>
    <div className={cn("min-w-0", bodyClassName)}>{children}</div>
  </section>;
}
