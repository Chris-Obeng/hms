"use client";

import * as React from "react";
import Link from "next/link";
import { Phone, Mail, ArrowUpRight } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import type { FullBookingDetail } from "./booking-detail-types";

interface BookingGuestPanelProps {
  booking: FullBookingDetail;
}

export function BookingGuestPanel({ booking }: BookingGuestPanelProps) {
  return (
    <div className="px-5 py-4 space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0 ring-1 ring-border/40">
          <span className="text-sm font-semibold text-foreground">
            {booking.guest?.fullName
              ? booking.guest.fullName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()
              : "?"}
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {booking.guest?.fullName || "Unknown Guest"}
          </p>
          {booking.guest?.id && (
            <Link
              href={`/dashboard/customers?id=${booking.guest.id}`}
              className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium mt-0.5"
            >
              View Full Profile <ArrowUpRight className="size-3" />
            </Link>
          )}
        </div>
      </div>

      <Separator className="opacity-40" />

      {/* Contact */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Contact Information
        </p>
        <div className="space-y-2.5">
          {booking.guest?.email ? (
            <a
              href={`mailto:${booking.guest.email}`}
              className="flex items-center gap-2.5 text-sm text-foreground hover:text-primary transition-colors group"
            >
              <Mail className="size-3.5 text-muted-foreground/50 shrink-0" />
              <span className="group-hover:underline">{booking.guest.email}</span>
            </a>
          ) : (
            <div className="flex items-center gap-2.5 text-sm">
              <Mail className="size-3.5 text-muted-foreground/50 shrink-0" />
              <span className="text-muted-foreground/50 italic">No email</span>
            </div>
          )}
          {booking.guest?.phone ? (
            <a
              href={`tel:${booking.guest.phone}`}
              className="flex items-center gap-2.5 text-sm text-foreground hover:text-primary transition-colors group"
            >
              <Phone className="size-3.5 text-muted-foreground/50 shrink-0" />
              <span className="group-hover:underline">{booking.guest.phone}</span>
            </a>
          ) : (
            <div className="flex items-center gap-2.5 text-sm">
              <Phone className="size-3.5 text-muted-foreground/50 shrink-0" />
              <span className="text-muted-foreground/50 italic">No phone</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
