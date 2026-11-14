import type { Viewport } from "next";
import { brandFontVariables } from "@/components/brand/fonts";

/**
 * Account routes (sign-in, sign-up, onboarding, suspended, deactivated) share
 * the Oriel brand surface: tokens from app/rl-theme.css and the brand fonts.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#fbfaf7",
  colorScheme: "light",
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <div className={`rl-theme ${brandFontVariables} min-h-dvh`}>{children}</div>;
}
