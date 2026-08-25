"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar } from "@heroui/react";
import { ArrowUpRight, Mail, Phone, UserRound } from "lucide-react";

import { getInitials } from "@/lib/format";
import type { FullBookingDetail } from "./booking-detail-types";

interface BookingGuestPanelProps {
  booking: FullBookingDetail;
}

export function BookingGuestPanel({ booking }: BookingGuestPanelProps) {
  const guest = booking.guest;
  const initials = getInitials(guest?.fullName);

  return (
    <section
      aria-labelledby="guest-details-heading"
      className="px-4 pb-1 pt-1 sm:px-5"
    >
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-3">
          <Avatar size="md" className="shrink-0 bg-primary/10">
            <Avatar.Fallback className="text-xs font-bold text-primary">
              {initials}
            </Avatar.Fallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <h3
              id="guest-details-heading"
              className="truncate text-sm font-semibold leading-tight text-foreground"
            >
              {guest?.fullName || "Unknown Guest"}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] capitalize text-muted-foreground">
              <UserRound className="size-3" />
              Primary guest
            </p>
          </div>

          {guest?.id && (
            <Link
              href={`/dashboard/customers?id=${guest.id}`}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-muted/60 px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted active:scale-[0.97]"
            >
              Profile
              <ArrowUpRight className="size-3" />
            </Link>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border/50 pt-3 sm:grid-cols-2">
          {guest?.email ? (
            <ContactLink href={`mailto:${guest.email}`} icon={<Mail className="size-3.5" />}>
              <span className="truncate">{guest.email}</span>
            </ContactLink>
          ) : (
            <ContactEmpty icon={<Mail className="size-3.5" />} label="No email" />
          )}
          {guest?.phone ? (
            <ContactLink href={`tel:${guest.phone}`} icon={<Phone className="size-3.5" />}>
              {guest.phone}
            </ContactLink>
          ) : (
            <ContactEmpty icon={<Phone className="size-3.5" />} label="No phone" />
          )}
        </div>
      </div>
    </section>
  );
}

function ContactLink({
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
      className="group inline-flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-foreground transition-colors hover:bg-muted/60 hover:text-primary"
    >
      <span className="shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary">
        {icon}
      </span>
      {children}
    </a>
  );
}

function ContactEmpty({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-2 py-1.5 text-[13px] italic text-muted-foreground/50">
      <span className="shrink-0">{icon}</span>
      {label}
    </span>
  );
}
