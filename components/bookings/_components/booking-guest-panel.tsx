"use client";

import Link from "next/link";
import { ArrowUpRight, Mail, Phone, UserRound } from "lucide-react";

import { AccordionSection } from "@/components/ui/accordion-section";
import { ContactEmpty, ContactLink } from "@/components/ui/contact-row";
import type { FullBookingDetail } from "./booking-detail-types";

interface BookingGuestPanelProps {
  booking: FullBookingDetail;
}

export function BookingGuestPanel({ booking }: BookingGuestPanelProps) {
  const guest = booking.guest;

  return (
    <AccordionSection
      id="guest"
      icon={<UserRound className="size-4 shrink-0 text-muted-foreground" />}
      title="Guest"
      bodyClassName="space-y-1"
    >
      {guest?.email ? (
        <ContactLink href={`mailto:${guest.email}`} icon={<Mail className="size-4" />}>
          {guest.email}
        </ContactLink>
      ) : (
        <ContactEmpty icon={<Mail className="size-4" />} label="No email on file" />
      )}
      {guest?.phone ? (
        <ContactLink href={`tel:${guest.phone}`} icon={<Phone className="size-4" />}>
          {guest.phone}
        </ContactLink>
      ) : (
        <ContactEmpty icon={<Phone className="size-4" />} label="No phone on file" />
      )}

      {guest?.id && (
        <Link
          href={`/dashboard/customers?guestId=${guest.id}`}
          className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          View full profile
          <ArrowUpRight className="size-3.5" />
        </Link>
      )}
    </AccordionSection>
  );
}
