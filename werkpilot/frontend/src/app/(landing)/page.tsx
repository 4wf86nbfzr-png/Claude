import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "WerkPilot AI – Der KI-Posteingang für Handwerksbetriebe",
  description: "Kundenanfragen aus E-Mail und Website an einem Ort, nach Dringlichkeit sortiert, mit fertigen Antwortentwürfen, Terminvorschlägen und Angebotsnachfass. 14 Tage kostenlos testen.",
  openGraph: { title: "WerkPilot AI – Der KI-Posteingang für Handwerksbetriebe", description: "Anfragen sortieren, beantworten, nachfassen – während Sie auf der Baustelle stehen.", images: ["/video/poster.jpg"] },
};

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "WerkPilot AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "de",
    offers: [
      { "@type": "Offer", name: "Starter", price: "79", priceCurrency: "EUR", billingIncrement: "P1M" },
      { "@type": "Offer", name: "Business", price: "149", priceCurrency: "EUR", billingIncrement: "P1M" },
      { "@type": "Offer", name: "Pro", price: "249", priceCurrency: "EUR", billingIncrement: "P1M" },
    ],
    description: "KI-gestützte Anfrage- und Terminorganisation für kleine Handwerksbetriebe in Deutschland.",
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Landing />
    </>
  );
}
