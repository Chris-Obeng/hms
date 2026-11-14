"use client";

import * as React from "react";
import { Button, Card } from "@heroui/react";
import { cn } from "@/lib/utils";

/**
 * One settings group: the title sits in a left column from `lg` (stacked above
 * on smaller screens) and the controls live in a HeroUI Card beside it.
 */
export function SettingsGroup({
  title,
  aside,
  children,
  className,
  id,
}: {
  title: string;
  /** Optional control shown next to the title (e.g. a count or link). */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className="grid scroll-mt-20 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8"
    >
      <div className="flex items-center justify-between gap-3 lg:block lg:pt-6">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {aside && <div className="lg:mt-2">{aside}</div>}
      </div>
      <Card
        className={cn(
          "gap-4 rounded-3xl border border-border/60 p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-6",
          className
        )}
      >
        {children}
      </Card>
    </section>
  );
}

/** A row inside a settings card: label on the left, control on the right. */
export function SettingsRow({
  label,
  hint,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-10 items-center justify-between gap-4", className)}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Sticky save bar that only appears when there is something to save, so the
 * page carries no dead "Save" button or status copy at rest.
 */
export function SaveBar({
  visible,
  saving,
  canSave = true,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
}: {
  visible: boolean;
  saving: boolean;
  canSave?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
}) {
  if (!visible) return null;
  return (
    // Phones: sit above the bottom tab bar (4rem plus the home-indicator inset).
    <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mt-6 md:bottom-4 lg:ml-[14rem]">
      <Card className="flex-row items-center justify-between gap-3 rounded-2xl border border-border/70 px-4 py-3 shadow-[0_8px_30px_rgb(15_23_42/0.12)] animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-[var(--ease-out-ui)] motion-reduce:animate-none">
        <p className="text-sm font-medium text-foreground">Unsaved changes</p>
        <div className="flex items-center gap-2">
          <Button variant="tertiary" onPress={onDiscard} isDisabled={saving} className="rounded-xl max-md:h-11">
            Discard
          </Button>
          <Button
            variant="primary"
            onPress={onSave}
            isPending={saving}
            isDisabled={!canSave}
            className="rounded-xl font-semibold max-md:h-11"
          >
            {saveLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
