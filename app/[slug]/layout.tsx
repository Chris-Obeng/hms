import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import "./booking.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

type Props = { params: Promise<{ slug: string }>; children: React.ReactNode };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("name, description")
    .eq("slug", slug)
    .single();

  return {
    title: hotel ? `${hotel.name} · Book Direct` : "Book a Room",
    description: hotel?.description
      ? hotel.description.slice(0, 160)
      : hotel
        ? `Book your stay at ${hotel.name} directly for the best rate.`
        : "Book a room",
  };
}

export default async function SlugLayout({ children, params }: Props) {
  const { slug } = await params;
  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id, status")
    .eq("slug", slug)
    .single();

  if (!hotel) notFound();

  return (
    <div
      className={`${cormorant.variable} ${dmSans.variable} booking-body min-h-[100dvh]`}
    >
      {children}
    </div>
  );
}
