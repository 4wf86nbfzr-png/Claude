import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Clairify: Kundenanfragen für Handwerksbetriebe automatisieren", template: "%s · Clairify" },
  description: "Anfragen aus Mail und Website an einem Ort, Antwortentwürfe der KI, Terminvorschläge und Erinnerungen an offene Angebote, für Elektriker, SHK, Maler, Dachdecker, Gebäudereiniger und GaLaBau.",
  alternates: { canonical: "./" },
  robots: process.env.NEXT_PUBLIC_NOINDEX === "1" ? { index: false, follow: false } : { index: true, follow: true },
  openGraph: { type: "website", locale: "de_DE", siteName: "Clairify" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="h-full">
      <head>
        <link rel="preload" as="font" type="font/woff2" href="/fonts/anton-latin.woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/inter-latin.woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
