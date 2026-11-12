import * as React from "react";

// Shared contact rows for the guest sheet and booking guest panel.
// A linked row (email/phone), a static row (nationality/ID), and an
// empty-state row when a field is unset.

export function ContactLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="group -mx-2 flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-[13px] text-foreground transition-colors hover:bg-muted/60"
    >
      <span className="shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground">
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </a>
  );
}

export function ContactStatic({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="-mx-2 flex min-w-0 items-center gap-3 px-2 py-2 text-[13px] text-foreground">
      <span className="shrink-0 text-muted-foreground/70">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}

export function ContactEmpty({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="-mx-2 flex items-center gap-3 px-2 py-2 text-[13px] text-muted-foreground">
      <span className="shrink-0 opacity-70">{icon}</span>
      {label}
    </span>
  );
}
