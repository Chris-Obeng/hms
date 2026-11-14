import type { Metadata, Viewport } from "next";
import { brandFontVariables } from "@/components/brand/fonts";

export const metadata: Metadata = {
  title: "Join your team",
  description: "Accept your Oriel staff invite.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#fbfaf7",
  colorScheme: "light",
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <div className={`rl-theme ${brandFontVariables} min-h-dvh`}>{children}</div>;
}
