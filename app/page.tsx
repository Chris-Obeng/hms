import type { Metadata } from "next";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { Hero } from "@/components/landing/hero";
import { Problem } from "@/components/landing/problem";
import { Showcase } from "@/components/landing/showcase";
import { How } from "@/components/landing/how";
import { DeepDive } from "@/components/landing/deep-dive";
import { Security } from "@/components/landing/security";
import { DemoCta } from "@/components/landing/demo-cta";
import { FinalCta } from "@/components/landing/final-cta";

export const metadata: Metadata = {
  title: "RoomLine — Run the whole property from one dashboard",
  description:
    "Reservations, front desk, housekeeping, channels, billing and reporting in one calm system for independent hotels.",
};

export default function HomePage() {
  return (
    <div data-theme="landing" className="light min-h-dvh bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <Problem />
        <Showcase />
        <How />
        <DeepDive />
        <Security />
        <DemoCta />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
