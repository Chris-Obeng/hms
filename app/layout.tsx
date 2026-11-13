import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono, Fraunces } from "next/font/google";
import { ToastProvider } from "@/components/toast-provider";
import { ClerkProvider } from "@clerk/nextjs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "@/components/providers";
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from "@vercel/analytics/next"
import "./globals.css";

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
});

// Fraunces: display face for the landing page only (scoped via landing
// tokens). Variable font — weight comes from the wght axis, so we omit
// `weight` and request only the extra SOFT/WONK axes the CSS pins to 0.
// preload:false keeps builds fast when Google Fonts is unreachable.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK"],
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "RoomLine",
    template: "%s | RoomLine",
  },
  description: "Hotel management and direct booking platform for independent properties",
  applicationName: "RoomLine",
  appleWebApp: {
    capable: true,
    // The product is light-only, so the status bar text must stay dark (the
    // platform default). "black-translucent" painted white text over light
    // content on iOS home-screen installs.
    statusBarStyle: "default",
    title: "RoomLine",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    // favicon.ico for legacy and default /favicon.ico requests, SVG for every
    // current browser, a full-bleed PNG for iOS (which rounds corners itself).
    // All generated from lib/brand/mark.ts by `pnpm icons`.
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: { url: "/icons/icon-180x180.png", sizes: "180x180", type: "image/png" },
  },
};

/**
 * Deliberately declares NO `themeColor`.
 *
 * A page-level theme colour overrides the web app manifest and paints the
 * installed PWA's title bar. Declaring the app's paper colour here is what turned
 * the RoomLine window caption white; leaving it unset hands the chrome back to the
 * platform default, which is the choice Mews and Cloudbeds make too (neither
 * ships a theme-color or a manifest).
 *
 * `colorScheme: "light"` is not a colour declaration: it tells the browser the
 * document does not support dark mode, so scrollbars, form controls and the
 * canvas stay light even when the OS is in dark mode.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${geistMono.variable} ${fraunces.variable} font-sans h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="native-shell min-h-dvh flex flex-col font-sans">
        <ClerkProvider>
          <Providers>
            <TooltipProvider>{children}
              <SpeedInsights />
              <Analytics />
            </TooltipProvider>
            <ToastProvider />
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
