import type { Metadata } from "next";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { Hero } from "@/components/landing/hero";
import { Problem } from "@/components/landing/problem";
import { Showcase } from "@/components/landing/showcase";
import { Capabilities } from "@/components/landing/capabilities";
import { TrustStrip } from "@/components/landing/trust-strip";
import { SocialProof } from "@/components/landing/social-proof";
import { FinalCta } from "@/components/landing/final-cta";

export const metadata: Metadata = {
  title: "RoomLine — the property system for independent hotels",
  description:
    "Bookings, payments, housekeeping and the night audit on one screen. Mobile money, cash and card — reconciled by the time you close.",
};

export default function HomePage() {
  return (
    <div data-theme="landing" className="light min-h-dvh bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <Problem />
        <Showcase />
        <Capabilities />
        <TrustStrip />
        <SocialProof />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
