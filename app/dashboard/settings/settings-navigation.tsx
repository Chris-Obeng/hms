"use client";

import {
  Bell,
  Building2,
  ChevronRight,
  CreditCard,
  FileClock,
  Mail,
  Settings2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card, Chip, Link, Surface } from "@heroui/react";

type IconName =
  | "building"
  | "bell"
  | "card"
  | "mail"
  | "settings"
  | "users"
  | "audit";

type Item = {
  label: string;
  description: string;
  href: string;
  restricted: boolean;
  icon: IconName;
};

type Section = {
  title: string;
  description: string;
  items: Item[];
};

const icons: Record<IconName, LucideIcon> = {
  building: Building2,
  bell: Bell,
  card: CreditCard,
  mail: Mail,
  settings: Settings2,
  users: Users,
  audit: FileClock,
};

export function SettingsNavigation({
  sections,
  isSuperAdmin,
}: {
  sections: Section[];
  isSuperAdmin: boolean;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
      {sections.map((section) => (
        <Card
          key={section.title}
          className="overflow-hidden border border-border/60 bg-surface shadow-sm"
        >
          <Card.Header className="border-b border-border/50 px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Card.Title className="text-base font-semibold tracking-tight sm:text-lg">
                  {section.title}
                </Card.Title>
                <Card.Description className="mt-1 max-w-md text-sm font-medium leading-5 text-foreground/70">
                  {section.description}
                </Card.Description>
              </div>
              <Chip size="sm" variant="soft" className="shrink-0 tabular-nums">
                {section.items.length} {section.items.length === 1 ? "area" : "areas"}
              </Chip>
            </div>
          </Card.Header>

          <Card.Content className="p-2 sm:p-3">
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = icons[item.icon];
                const canAccess = !item.restricted || isSuperAdmin;

                return (
                  <Link
                    key={`${section.title}-${item.href}-${item.label}`}
                    href={canAccess ? item.href : undefined}
                    isDisabled={!canAccess}
                    aria-label={
                      canAccess
                        ? `${item.label}: ${item.description}`
                        : `${item.label}: super admin access required`
                    }
                    className="group grid min-h-20 w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-3 text-foreground no-underline transition-colors hover:bg-surface-secondary data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-60 sm:gap-4 sm:px-4"
                  >
                    <Surface
                      variant="secondary"
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors group-hover:bg-accent/10 sm:size-11"
                    >
                      <Icon className="size-[1.125rem] text-foreground/65 transition-colors group-hover:text-accent" />
                    </Surface>

                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold sm:text-[0.9375rem]">
                          {item.label}
                        </span>
                        {!canAccess ? (
                          <Chip size="sm" variant="secondary">
                            <ShieldCheck className="size-3" />
                            <Chip.Label>Admin only</Chip.Label>
                          </Chip>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs font-medium leading-5 text-foreground/70 sm:text-sm">
                        {item.description}
                      </span>
                    </span>

                    <ChevronRight className="size-4 shrink-0 text-foreground/45 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                );
              })}
            </div>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
