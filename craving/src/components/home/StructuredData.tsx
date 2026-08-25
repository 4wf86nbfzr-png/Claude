import { BRAND, DELIVERY_ZONES, OPENING_HOURS } from "@/data/config";
import { CATEGORIES } from "@/data/categories";
import { PRODUCTS } from "@/data/products";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Strukturierte Daten fuer Suchmaschinen (schema.org/Restaurant + Menue).
 * Die Firmenangaben sind Platzhalter — sie werden mit den echten Daten
 * automatisch korrekt, weil sie aus data/config.ts kommen.
 */
export function StructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: BRAND.name,
    description: "Doener, Pizza und Croque zum selbst Zusammenstellen.",
    servesCuisine: ["Doener", "Pizza", "Sandwiches"],
    priceRange: "€€",
    url: BRAND.url,
    image: `${BRAND.url}/og.png`,
    address: {
      "@type": "PostalAddress",
      streetAddress: BRAND.street,
      postalCode: BRAND.postalCode,
      addressLocality: BRAND.city,
      addressCountry: BRAND.country,
    },
    openingHoursSpecification: Object.entries(OPENING_HOURS).flatMap(([day, ranges]) =>
      ranges.map((r) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: DAY_NAMES[Number(day)],
        opens: r.from,
        closes: r.to,
      })),
    ),
    areaServed: DELIVERY_ZONES.flatMap((z) =>
      z.postalCodes.map((plz) => ({ "@type": "PostalCodeRangeSpecification", postalCode: plz })),
    ),
    hasMenu: {
      "@type": "Menu",
      hasMenuSection: CATEGORIES.filter((c) => !c.simple).map((category) => ({
        "@type": "MenuSection",
        name: category.name,
        hasMenuItem: PRODUCTS.filter((p) => p.categoryId === category.id).map((p) => ({
          "@type": "MenuItem",
          name: p.name,
          description: p.description,
          offers: { "@type": "Offer", price: (p.basePrice / 100).toFixed(2), priceCurrency: "EUR" },
        })),
      })),
    },
  };

  return (
    <script
      type="application/ld+json"
      // Statisch erzeugtes JSON aus eigenen Daten — keine Nutzereingaben.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
