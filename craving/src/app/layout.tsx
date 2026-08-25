import type { Metadata, Viewport } from "next";
import { Anton, Manrope, JetBrains_Mono } from "next/font/google";
import { BRAND } from "@/data/config";
import { StoreHydrator } from "@/components/providers/StoreHydrator";
import { SmoothScroll } from "@/components/providers/SmoothScroll";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BottomNav } from "@/components/layout/BottomNav";
import { Toaster } from "@/components/ui/Toaster";
import { CartFlight } from "@/components/layout/CartFlight";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import "./globals.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: {
    default: `${BRAND.name} — ${BRAND.claim}`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    "Doener, Pizza und Croque selbst zusammenstellen — Zutat fuer Zutat sichtbar. Liefern lassen oder abholen.",
  applicationName: BRAND.name,
  keywords: ["Doener", "Pizza", "Croque", "Lieferservice", "Online bestellen", "Food Builder"],
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.claim}`,
    description: "Bau dein Essen sichtbar zusammen. Doener. Pizza. Croque.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${BRAND.name} — ${BRAND.claim}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — ${BRAND.claim}`,
    description: "Bau dein Essen sichtbar zusammen. Doener. Pizza. Croque.",
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: BRAND.name },
  formatDetection: { telephone: false },
  // Testbetrieb: noch nicht fuer Suchmaschinen freigeben.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0A090B",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${anton.variable} ${manrope.variable} ${mono.variable}`}>
      <body className="min-h-dvh text-paper antialiased">
        <StoreHydrator />
        <SmoothScroll />
        <a
          href="#inhalt"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ember focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-white"
        >
          Zum Inhalt springen
        </a>
        <OfflineBanner />
        <Header />
        <main id="inhalt" className="stack-safe">
          {children}
        </main>
        <Footer />
        <BottomNav />
        <Toaster />
        <CartFlight />
      </body>
    </html>
  );
}
