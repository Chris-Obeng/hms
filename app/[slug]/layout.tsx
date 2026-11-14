import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { getPublicHotel } from "./_lib/get-public-hotel";
import { BookingToastProvider } from "@/components/booking/booking-toast";
import "./booking.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-booking-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-booking-mono",
  display: "swap",
});

type Props = { params: Promise<{ slug: string }>; children: React.ReactNode };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const hotel = await getPublicHotel(slug);

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
  const hotel = await getPublicHotel(slug);

  if (!hotel) notFound();

  return (
    <div
      className={`${inter.variable} ${jetbrainsMono.variable} booking-body min-h-[100dvh]`}
    >
      {children}
      <BookingToastProvider />
    </div>
  );
}
