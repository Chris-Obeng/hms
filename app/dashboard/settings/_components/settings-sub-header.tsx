"use client";

import Link from "next/link";
import { ArrowLeft, Bell, Building2, CreditCard, FileClock, type LucideIcon } from "lucide-react";

/**
 * Shared header for settings sub-pages: back link, icon tile, title, subtitle.
 *
 * Icons are referenced by NAME (string), never by passing a component from a
 * Server Component — function props cannot cross the RSC serialization boundary
 * and crash production builds with React error #441.
 */

const ICONS = {
  building: Building2,
  bell: Bell,
  card: CreditCard,
  audit: FileClock,
} satisfies Record<string, LucideIcon>;

export type SubHeaderIcon = keyof typeof ICONS;

export function SettingsSubHeader({
  href = "/dashboard/settings",
  icon,
  title,
  subtitle,
}: {
  href?: string;
  icon?: SubHeaderIcon;
  title: string;
  subtitle?: string;
}) {
  const Icon = icon ? ICONS[icon] : null;

  return (
    <div className="flex items-center gap-3 min-w-0">
      <Link
        href={href}
        aria-label="Back to settings"
        className="tap-target rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
      >
        <ArrowLeft className="size-4" />
      </Link>
      {Icon && (
        <div
          aria-hidden
          className="hidden sm:flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/40"
        >
          <Icon className="size-4 text-foreground/60" />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="text-page-title text-foreground truncate">{title}</h1>
        {subtitle && (
          <p className="text-caption text-muted-foreground mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
