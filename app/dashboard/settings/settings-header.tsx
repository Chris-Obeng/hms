"use client";

import { Chip } from "@heroui/react";
import { ShieldCheck } from "lucide-react";

export function SettingsHeader({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <header className="flex justify-end border-b border-border/60 pb-6 sm:pb-8">
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
