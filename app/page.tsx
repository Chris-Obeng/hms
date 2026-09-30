import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { Hero } from "@/components/landing/hero";
import { Showcase } from "@/components/landing/showcase";
import { How } from "@/components/landing/how";
import { DeepDive } from "@/components/landing/deep-dive";
import { Security } from "@/components/landing/security";
import { DemoCta } from "@/components/landing/demo-cta";

export const metadata: Metadata = {
  title: { absolute: "RoomLine — More room for hospitality" },
  description: "Your hotel, perfectly in sync. Bring reservations, room operations, guest folios, and reporting together with RoomLine, the property management system for independent hotels.",
  openGraph: {
    title: "RoomLine — More room for hospitality",
    description: "One considered system for the way your hotel runs. Explore reservations, rooms, payments, and reporting.",
    type: "website",
    images: [{ url: "/images/landing/hotel-exterior.jpg", width: 2000, height: 2000, alt: "A hotel at dusk — more room for hospitality with RoomLine" }],
  },
  twitter: { card: "summary_large_image" },
};

// Keep the marketing page zoomable, including on mobile Safari.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#141e1d" },
  ],
};

export default function HomePage() {
  return (
    <div data-theme="landing" className="lp-page">
      <a href="#main-content" className="lp-skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <Showcase />
        <DeepDive />
        <Security />
        <How />
        <DemoCta />
      </main>
      <SiteFooter />
    </div>
  );
}
