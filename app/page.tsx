import type { Metadata, Viewport } from "next";
import { landingDisplay, landingText } from "@/components/landing/fonts";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Setup } from "@/components/landing/setup";
import { ClosingCta } from "@/components/landing/closing-cta";
import { RevealObserver } from "@/components/landing/reveal-observer";

const title = "RoomLine: hotel software for independent hotels in Ghana";
const description =
  "Run a calmer front desk. A live room calendar, MoMo, card and cash on one GHS bill, a commission-free booking page and a one-click night audit for hotels and guesthouses in Ghana.";

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
    siteName: "RoomLine",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/icon-180x180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#f5f3ee",
  colorScheme: "light",
};

export default function HomePage() {
  return (
    <div
      id="top"
      className={`rl-landing ${landingDisplay.variable} ${landingText.variable}`}
    >
      <a href="#main-content" className="rl-skip">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <Features />
        <Setup />
        <ClosingCta />
      </main>
      <SiteFooter />
      <RevealObserver />
    </div>
  );
}
