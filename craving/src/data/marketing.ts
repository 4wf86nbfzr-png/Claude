import type { MenuDeal, Recommendation } from "@/types/domain";

/** Empfehlungsbloecke — modular, damit spaeter ein Algorithmus liefern kann. */
export const RECOMMENDATIONS: Recommendation[] = [
  {
    id: "rec-sides",
    title: "Passt perfekt dazu",
    whenCategories: ["doener", "pizza", "croque"],
    productIds: ["side-pommes", "side-halloumi", "side-suesskartoffel"],
  },
  {
    id: "rec-drinks",
    title: "Noch Durst?",
    whenCategories: [],
    productIds: ["drink-ayran", "drink-cola", "drink-limo", "drink-wasser"],
  },
  {
    id: "rec-others",
    title: "Andere bestellen dazu",
    whenCategories: ["doener"],
    productIds: ["side-pommes", "drink-ayran"],
  },
];

/** Menue-Upsell. `saving` wird im UI ausgewiesen. */
export const MENU_DEALS: MenuDeal[] = [
  {
    id: "menu-doener",
    name: "Doener Menue",
    description: "Classic Doener, Pommes, Getraenk.",
    productIds: ["doener-classic", "side-pommes", "drink-cola"],
    price: 1150,
    saving: 200,
    available: true,
  },
  {
    id: "menu-pizza",
    name: "Pizza Menue",
    description: "Pizza Salami, Beilagensalat, Getraenk.",
    productIds: ["pizza-salami", "side-salat", "drink-wasser"],
    price: 1450,
    saving: 180,
    available: true,
  },
  {
    id: "menu-croque",
    name: "Croque Menue",
    description: "Croque Schinken, Pommes, Ayran.",
    productIds: ["croque-schinken", "side-pommes", "drink-ayran"],
    price: 1050,
    saving: 190,
    available: true,
  },
];
