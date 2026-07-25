import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/toast-provider";
import { ClerkProvider } from "@clerk/nextjs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
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

// Plus Jakarta Sans: preload:false prevents blocking compilation when
// Google Fonts is unreachable (firewall/offline). Falls back to system font.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "HotelOS Pro",
    template: "%s | HotelOS Pro",
  },
  description: "Hotel management and direct booking platform for independent properties",
  applicationName: "HotelOS Pro",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HotelOS",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/icon-180x180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF8" },
    { media: "(prefers-color-scheme: dark)", color: "#1C1917" },
  ],
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
      suppressHydrationWarning
    >
      <body className="native-shell min-h-dvh flex flex-col font-sans">
        {/* ── Theme initialisation — runs before React hydrates (SSR-only), prevents FOUC ── */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          id="theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var e,l=localStorage.getItem("theme"),d="system";if(l==="dark"||l==="light")e=l;else{var m=window.matchMedia("(prefers-color-scheme: dark)");e=m.matches?"dark":"light"}document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(e)}catch(t){}})()`,
          }}
        />
        <ClerkProvider>
          <Providers>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <TooltipProvider>{children}
                <SpeedInsights />
                <Analytics />
              </TooltipProvider>
              <ToastProvider />
            </ThemeProvider>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
