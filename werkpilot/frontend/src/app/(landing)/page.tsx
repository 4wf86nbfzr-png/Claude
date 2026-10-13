import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Clairify: Der Posteingang mit KI für Handwerksbetriebe",
  description: "Kundenanfragen aus Mail und Website an einem Ort, nach Dringlichkeit sortiert, mit fertigen Antwortentwürfen, Terminvorschlägen und Nachfassen offener Angebote. Kostenlos testen, ohne Zahlungsdaten.",
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
    offers: PLANS.map((p) => ({ "@type": "Offer", name: p.name, price: String(p.priceEur), priceCurrency: "EUR", billingIncrement: "P1M" })),
    description: "Anfragen und Termine für kleine Handwerksbetriebe in Deutschland, organisiert mit KI.",
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Landing />
    </>
  );
}
