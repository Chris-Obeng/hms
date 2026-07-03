import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import "./booking.css";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400","500","600","700"], style: ["normal","italic"], variable: "--font-cormorant", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["300","400","500"], variable: "--font-dm-sans", display: "swap" });

type Props = { params: Promise<{ slug: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { data: hotel } = await supabaseAdmin.from("hotels").select("name").eq("slug", slug).single();
  return { title: hotel ? `${hotel.name} - Book Direct` : "Book a Room" };
}

export default async function SlugLayout({ children, params }: Props) {
  const { slug } = await params;
  console.log("[slug layout] slug =", slug);
  const { data: hotel, error } = await supabaseAdmin.from("hotels").select("id, status").eq("slug", slug).single();
  console.log("[slug layout] hotel =", hotel, "error =", error?.message);
  if (!hotel) notFound();
  return (
    <div className={`${cormorant.variable} ${dmSans.variable} booking-body min-h-screen bg-[#FAFAF8] text-[#1C1917] antialiased`}>
      {children}
    </div>
  );
}
