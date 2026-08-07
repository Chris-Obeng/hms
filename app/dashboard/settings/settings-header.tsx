"use client";

import { Chip, Surface } from "@heroui/react";
import { Settings, ShieldCheck } from "lucide-react";

export function SettingsHeader({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <header className="flex flex-col gap-5 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between sm:pb-8">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2">
          <Surface
            variant="secondary"
            className="flex size-8 items-center justify-center rounded-lg"
          >
            <Settings className="size-4 text-accent" />
          </Surface>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/65">
            Workspace settings
          </p>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl lg:text-5xl">
          Configure your hotel
        </h1>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-foreground/70 sm:text-base">
          Manage property operations, guest communication, payments, and team access from one place.
        </p>
      </div>
      <Chip
        variant="soft"
        color={isSuperAdmin ? "accent" : "default"}
        className="w-fit shrink-0"
      >
        <ShieldCheck className="size-3.5" />
        <Chip.Label>
          {isSuperAdmin ? "Super admin access" : "Standard access"}
        </Chip.Label>
      </Chip>
    </header>
  );
}
