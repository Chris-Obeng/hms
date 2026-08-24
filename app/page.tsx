import type { Metadata } from "next";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { Hero } from "@/components/landing/hero";
import { ProofSection } from "@/components/landing/proof";
import { HowItWorks } from "@/components/landing/how-it-works";
import { AfricaStrip } from "@/components/landing/africa-strip";
import { FounderNote } from "@/components/landing/founder-note";
import { PricingTeaser } from "@/components/landing/pricing-teaser";

export const metadata: Metadata = {
  title: "Hotel management for Ghana and across Africa",
  description:
    "RoomLine puts bookings, payments, housekeeping and night audit on one screen. Built for guesthouses and hotels in Ghana — mobile money, cash and card included.",
};

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-forest text-ivory selection:bg-gold/30">
      <SiteHeader />
      <main>
        <Hero />
        <ProofSection />
        <HowItWorks />
        <AfricaStrip />
        <FounderNote />
        <PricingTeaser />
      </main>
      <SiteFooter />
    </div>
  );
}
