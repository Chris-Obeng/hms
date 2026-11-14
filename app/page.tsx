import type { Metadata, Viewport } from "next";
import { brandFontVariables } from "@/components/brand/fonts";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { Hero } from "@/components/landing/hero";
import { Showcase } from "@/components/landing/showcase";
import { Features } from "@/components/landing/features";
import { Setup } from "@/components/landing/setup";
import { Trust } from "@/components/landing/trust";
import { ClosingCta } from "@/components/landing/closing-cta";
import { DirectCalculator } from "@/components/landing/direct-calculator";
import { Faq } from "@/components/landing/faq";
import { RevealObserver } from "@/components/landing/reveal-observer";

const title = "Oriel: hotel software for independent hotels and guesthouses";
const description =
  "Run a calmer front desk. A live room calendar, mobile money, card and cash on one GHS bill, your own booking page and a one-click night audit for hotels and guesthouses.";

const deploymentHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const siteOrigin =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title,
    description,
    type: "website",
    locale: "en_GH",
    siteName: "Oriel",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  // Matches the sticky header, so mobile browser chrome blends into it.
  themeColor: "#fbfaf7",
  colorScheme: "light",
};

export default function HomePage() {
  return (
    <div id="top" className={`rl-theme rl-landing ${brandFontVariables}`}>
      <a href="#main-content" className="rl-skip">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <Showcase />
        <Features />
        <DirectCalculator />
        <Setup />
        <Trust />
        <Faq />
        <ClosingCta />
      </main>
      <SiteFooter />
      <RevealObserver />
    </div>
  );
}
