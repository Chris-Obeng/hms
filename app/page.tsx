import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { Hero } from "@/components/landing/hero";
import { Showcase } from "@/components/landing/showcase";
import { DeepDive } from "@/components/landing/deep-dive";
import { How } from "@/components/landing/how";
import { DemoCta } from "@/components/landing/demo-cta";

const title =
  "RoomLine — Hotel software for independent properties in Ghana";
const description =
  "Run a calmer front desk. Reservations, rooms, Mobile Money payments, direct bookings, and night audit in one place for independent hotels and guesthouses in Ghana.";

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
  themeColor: "#f6f6f3",
  colorScheme: "light",
};

export default function HomePage() {
  return (
    <div data-theme="roomline-landing" className="rl-landing">
      <a href="#main-content" className="rl-skip">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <Showcase />
        <DeepDive />
        <How />
        <DemoCta />
      </main>
      <SiteFooter />
    </div>
  );
}
