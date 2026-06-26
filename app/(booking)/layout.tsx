import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Toaster } from "@/components/ui/sonner";
import "./booking.css";

// Editorial serif for headings — premium, hospitality-coded
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

// Clean geometric sans for body — different character from admin's Jakarta
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const slug = h.get("x-hotel-slug") ?? "";
  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("name")
    .or(`slug.eq.${slug},custom_domain.eq.${slug}`)
    .single();
  return {
    title: hotel ? `${hotel.name} — Book Direct` : "Book a Room",
  };
}

export default async function BookingLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const slug = h.get("x-hotel-slug") ?? "";

  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id, name, slug, logo_url, cover_image_url, settings")
    .or(`slug.eq.${slug},custom_domain.eq.${slug}`)
    .eq("status", "active")
    .single();

  return (
    <html lang="en" className={`${cormorant.variable} ${dmSans.variable}`}>
      <body className="booking-body min-h-screen bg-[#FAFAF8] text-[#1C1917] antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
