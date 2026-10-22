import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { Hero } from "@/components/landing/hero";
import { Showcase } from "@/components/landing/showcase";
import { DeepDive } from "@/components/landing/deep-dive";
import { How } from "@/components/landing/how";
import { DemoCta } from "@/components/landing/demo-cta";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-roomline",
  display: "swap",
});

const title = "RoomLine — Hotel management for independent hospitality in Ghana";
const description = "Every room. Every guest. All in order. Manage reservations, room availability, front desk, guest bills, and reporting with RoomLine, built for independent hotels and guesthouses in Ghana.";
// Use the configured public origin or the real deployment host, never a guessed domain.
const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? (deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000");

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
    images: [{ url: "/images/landing/roomline-social.png", width: 1200, height: 630, alt: "RoomLine — Every room. Every guest. All in order." }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/images/landing/roomline-social.png"] },
  icons: {
    icon: [{ url: "/images/landing/roomline-icon.svg", type: "image/svg+xml" }],
    apple: "/images/landing/roomline-icon-180.png",
  },
};

// Override the shared viewport only on the landing page so visitors can zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f8f9fb",
  colorScheme: "light",
};

export default function HomePage() {
  return (
    <div data-theme="roomline-landing" className={`rl-landing ${manrope.variable}`}>
      <a href="#main-content" className="rl-skip">Skip to content</a>
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
