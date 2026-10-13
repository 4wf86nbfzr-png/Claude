import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "Clairify: Der Posteingang mit KI für Handwerksbetriebe",
  description: "Kundenanfragen aus Mail und Website an einem Ort, nach Dringlichkeit sortiert, mit fertigen Antwortentwürfen, Terminvorschlägen und Nachfassen offener Angebote. 14 Tage kostenlos testen.",
  openGraph: { title: "Clairify: Der Posteingang mit KI für Handwerksbetriebe", description: "Anfragen sortieren, beantworten, nachfassen, während Sie auf der Baustelle stehen.", images: ["/video/poster-1080.jpg"] },
};

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Clairify",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "de",
    offers: [
      { "@type": "Offer", name: "Starter", price: "79", priceCurrency: "EUR", billingIncrement: "P1M" },
      { "@type": "Offer", name: "Business", price: "149", priceCurrency: "EUR", billingIncrement: "P1M" },
      { "@type": "Offer", name: "Pro", price: "249", priceCurrency: "EUR", billingIncrement: "P1M" },
    ],
    description: "Anfragen und Termine für kleine Handwerksbetriebe in Deutschland, organisiert mit KI.",
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Landing />
    </>
  );
}
