import type { Metadata } from "next";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { Hero } from "@/components/landing/hero";
import { Problem } from "@/components/landing/problem";
import { Showcase } from "@/components/landing/showcase";
import { Capabilities } from "@/components/landing/capabilities";
import { TrustStrip } from "@/components/landing/trust-strip";
import { Pricing } from "@/components/landing/pricing";
import { SocialProof } from "@/components/landing/social-proof";
import { FinalCta } from "@/components/landing/final-cta";

export const metadata: Metadata = {
  title: "Hotel management for Ghana and across Africa",
  description:
    "RoomLine puts bookings, payments, housekeeping and night audit on one screen. Built for Hotels in Ghana — mobile money, cash and card included.",
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
        <Pricing />
        <SocialProof />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
