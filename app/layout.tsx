import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ClerkProvider } from "@clerk/nextjs";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "HotelOS Pro",
    template: "%s | HotelOS Pro",
  },
  description: "Hotel management and direct booking platform for independent properties",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HotelOS Pro",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon-180x180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1C1917",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${geistMono.variable} font-sans h-full antialiased`}
    >
      <head>
        {/* PWA install hints */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HotelOS Pro" />
        <link rel="apple-touch-icon" href="/icons/icon-180x180.png" />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ClerkProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ClerkProvider>
        <Toaster />
      </body>
    </html>
  );
}
