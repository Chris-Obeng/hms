import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono, Fraunces } from "next/font/google";
import Script from "next/script";
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
    statusBarStyle: "black-translucent",
    title: "RoomLine",
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
      className={`${jakarta.variable} ${geistMono.variable} ${fraunces.variable} font-sans h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="native-shell min-h-dvh flex flex-col font-sans">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
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
