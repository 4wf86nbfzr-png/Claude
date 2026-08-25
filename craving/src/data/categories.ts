import type { Category, ChoiceGroup } from "@/types/domain";

/**
 * Kategorien inklusive Builder-Konfiguration.
 *
 * Eine neue Kategorie hinzufuegen = ein weiteres Objekt hier + Zutaten in
 * ingredients.ts + Produkte in products.ts. Das UI liest ausschliesslich
 * diese Struktur, es gibt keinen kategoriespezifischen Code im Builder
 * ausser dem Renderer (features/builder/renderers).
 */

const pizzaGroups: ChoiceGroup[] = [
  {
    id: "pz-groesse",
    label: "Groesse",
    hint: "Der Preis der Extras waechst mit.",
    kind: "option",
    selection: "single",
    min: 1,
    memberIds: ["pz-26", "pz-32", "pz-36"],
    defaultIds: ["pz-26"],
  },
  {
    id: "pz-teig-art",
    label: "Teig",
    kind: "option",
    selection: "single",
    min: 1,
    memberIds: ["pz-teig-standard", "pz-teig-duenn", "pz-teig-kaeserand"],
    defaultIds: ["pz-teig-standard"],
  },
  {
    id: "pz-basis",
    label: "Basis",
    hint: "Kannst du abwaehlen — Pizza bianca geht auch.",
    kind: "ingredient",
    selection: "multiple",
    removable: true,
    memberIds: ["pz-tomatensosse", "pz-kaese"],
    defaultIds: ["pz-tomatensosse", "pz-kaese"],
  },
  {
    id: "pz-fleisch",
    label: "Fleisch",
    kind: "ingredient",
    selection: "multiple",
    memberIds: ["pz-salami", "pz-schinken", "pz-sucuk", "pz-haehnchen"],
  },
  {
    id: "pz-gemuese",
    label: "Gemuese",
    kind: "ingredient",
    selection: "multiple",
    memberIds: [
      "pz-champignons", "pz-paprika", "pz-zwiebeln", "pz-oliven",
      "pz-jalapenos", "pz-mais", "pz-artischocken",
    ],
  },
  {
    id: "pz-finish",
    label: "Finish",
    hint: "Kommt zum Schluss auf die Pizza.",
    kind: "ingredient",
    selection: "multiple",
    memberIds: ["pz-mozzarella", "pz-extra-kaese", "pz-rucola"],
  },
];

const donerGroups: ChoiceGroup[] = [
  {
    id: "dn-groesse",
    label: "Groesse",
    kind: "option",
    selection: "single",
    min: 1,
    memberIds: ["dn-normal", "dn-gross"],
    defaultIds: ["dn-normal"],
  },
  {
    id: "dn-brot",
    label: "Brot",
    kind: "option",
    selection: "single",
    min: 1,
    memberIds: ["dn-brot-fladen", "dn-brot-duerum", "dn-brot-vollkorn"],
    defaultIds: ["dn-brot-fladen"],
  },
  {
    id: "dn-fleisch",
    label: "Fleisch",
    hint: "Eins reicht — mehr geht ueber die Extras.",
    kind: "ingredient",
    selection: "single",
    min: 1,
    memberIds: ["dn-kalb", "dn-haehnchen", "dn-mix", "dn-falafel"],
    defaultIds: ["dn-kalb"],
  },
  {
    id: "dn-salat",
    label: "Salat",
    kind: "ingredient",
    selection: "multiple",
    memberIds: ["dn-salat", "dn-rotkohl", "dn-weisskohl"],
    defaultIds: ["dn-salat"],
  },
  {
    id: "dn-gemuese",
    label: "Gemuese",
    kind: "ingredient",
    selection: "multiple",
    memberIds: ["dn-tomate", "dn-gurke", "dn-zwiebel", "dn-mais", "dn-jalapenos"],
    defaultIds: ["dn-tomate", "dn-gurke", "dn-zwiebel"],
  },
  {
    id: "dn-sossen",
    label: "Sossen",
    hint: "Bis zu drei.",
    kind: "ingredient",
    selection: "multiple",
    min: 1,
    max: 3,
    memberIds: ["dn-sosse-kraeuter", "dn-sosse-knoblauch", "dn-sosse-scharf", "dn-sosse-cocktail"],
    defaultIds: ["dn-sosse-kraeuter"],
  },
  {
    id: "dn-extras",
    label: "Extras",
    kind: "ingredient",
    selection: "multiple",
    memberIds: ["dn-kaese", "dn-feta", "dn-extra-fleisch"],
  },
  {
    id: "dn-schaerfe",
    label: "Schaerfe",
    kind: "option",
    selection: "single",
    min: 1,
    memberIds: ["dn-schaerfe-0", "dn-schaerfe-1", "dn-schaerfe-2", "dn-schaerfe-3"],
    defaultIds: ["dn-schaerfe-1"],
  },
];

const croqueGroups: ChoiceGroup[] = [
  {
    id: "cq-brot",
    label: "Brot",
    kind: "option",
    selection: "single",
    min: 1,
    memberIds: ["cq-brot-toast", "cq-brot-sauerteig", "cq-brot-vollkorn"],
    defaultIds: ["cq-brot-toast"],
  },
  {
    id: "cq-groesse",
    label: "Aufbau",
    kind: "option",
    selection: "single",
    min: 1,
    memberIds: ["cq-klassisch", "cq-double"],
    defaultIds: ["cq-klassisch"],
  },
  {
    id: "cq-kaese",
    label: "Kaese",
    hint: "Ohne Kaese ist es ein Sandwich.",
    kind: "ingredient",
    selection: "multiple",
    min: 1,
    memberIds: ["cq-gouda", "cq-emmentaler", "cq-mozzarella"],
    defaultIds: ["cq-gouda"],
  },
  {
    id: "cq-fleisch",
    label: "Fleisch",
    kind: "ingredient",
    selection: "multiple",
    memberIds: ["cq-schinken", "cq-salami", "cq-sucuk", "cq-haehnchen", "cq-bacon"],
  },
  {
    id: "cq-gemuese",
    label: "Gemuese",
    kind: "ingredient",
    selection: "multiple",
    memberIds: ["cq-tomate", "cq-zwiebeln", "cq-champignons", "cq-spinat", "cq-jalapenos"],
  },
  {
    id: "cq-sossen",
    label: "Sossen",
    hint: "Bis zu zwei.",
    kind: "ingredient",
    selection: "multiple",
    max: 2,
    memberIds: ["cq-sosse-remoulade", "cq-sosse-bbq", "cq-sosse-kraeuter", "cq-sosse-chili"],
  },
  {
    id: "cq-extras",
    label: "Extras",
    kind: "ingredient",
    selection: "multiple",
    memberIds: ["cq-ei", "cq-extra-kaese"],
  },
];

export const CATEGORIES: Category[] = [
  {
    id: "doener",
    slug: "doener",
    name: "Doener",
    headline: "BUILD YOUR DOENER.",
    claim: "Vom Spiess. Nicht vorgeschnitten.",
    description:
      "Fladenbrot aus dem Steinofen, Fleisch vom Spiess, alles frisch geschnitten. Du legst fest, was reinkommt — und was nicht.",
    accent: "#FF5A2B",
    available: true,
    order: 1,
    builder: {
      groups: donerGroups,
      steps: [
        { id: "dn-step-basis", label: "Basis", kicker: "Groesse & Brot", groupIds: ["dn-groesse", "dn-brot"] },
        { id: "dn-step-fleisch", label: "Fleisch", kicker: "Das Wichtigste zuerst", groupIds: ["dn-fleisch"] },
        { id: "dn-step-gruen", label: "Gruen", kicker: "Salat & Gemuese", groupIds: ["dn-salat", "dn-gemuese"] },
        { id: "dn-step-sosse", label: "Sosse", kicker: "Bis zu drei", groupIds: ["dn-sossen", "dn-schaerfe"] },
        { id: "dn-step-extras", label: "Extras", kicker: "Noch was drauf?", groupIds: ["dn-extras"] },
      ],
    },
  },
  {
    id: "pizza",
    slug: "pizza",
    name: "Pizza",
    headline: "STACK YOUR PIZZA.",
    claim: "48 Stunden Teigruhe. Steinofen.",
    description:
      "Teig, der Zeit hatte. Sosse aus ganzen Tomaten. Und ab da entscheidest du, was oben drauf landet.",
    accent: "#FF8A1F",
    available: true,
    order: 2,
    builder: {
      groups: pizzaGroups,
      steps: [
        { id: "pz-step-basis", label: "Basis", kicker: "Groesse & Teig", groupIds: ["pz-groesse", "pz-teig-art"] },
        { id: "pz-step-sosse", label: "Sosse", kicker: "Das Fundament", groupIds: ["pz-basis"] },
        { id: "pz-step-belag", label: "Belag", kicker: "Leg los", groupIds: ["pz-fleisch", "pz-gemuese"] },
        { id: "pz-step-finish", label: "Finish", kicker: "Der letzte Griff", groupIds: ["pz-finish"] },
      ],
    },
  },
  {
    id: "croque",
    slug: "croque",
    name: "Croque",
    headline: "PRESS YOUR CROQUE.",
    claim: "Gepresst, bis der Kaese Faeden zieht.",
    description:
      "Zwei Scheiben, alles dazwischen, unter Druck goldbraun. Der Kaese ist Pflicht, der Rest deine Sache.",
    accent: "#F2B830",
    available: true,
    order: 3,
    builder: {
      groups: croqueGroups,
      steps: [
        { id: "cq-step-brot", label: "Brot", kicker: "Grundlage", groupIds: ["cq-brot", "cq-groesse"] },
        { id: "cq-step-kaese", label: "Kaese", kicker: "Pflichtprogramm", groupIds: ["cq-kaese"] },
        { id: "cq-step-fuellung", label: "Fuellung", kicker: "Fleisch & Gemuese", groupIds: ["cq-fleisch", "cq-gemuese"] },
        { id: "cq-step-finish", label: "Finish", kicker: "Sosse & Extras", groupIds: ["cq-sossen", "cq-extras"] },
      ],
    },
  },
  {
    id: "sides",
    slug: "beilagen",
    name: "Beilagen",
    headline: "SIDE ORDER.",
    claim: "Weil es ohne halb ist.",
    description: "Pommes, Halloumi, Salat — kein Builder noetig.",
    accent: "#C9A227",
    available: true,
    order: 4,
    simple: true,
    builder: { groups: [], steps: [] },
  },
  {
    id: "drinks",
    slug: "getraenke",
    name: "Getraenke",
    headline: "STILL DURST?",
    claim: "Kalt gestellt.",
    description: "Cola, Ayran, Wasser, hausgemachte Limo.",
    accent: "#4E8F8F",
    available: true,
    order: 5,
    simple: true,
    builder: { groups: [], steps: [] },
  },
];

export const CATEGORY_INDEX: ReadonlyMap<string, Category> = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Kategorien mit Builder — Startseite, Builder-Navigation, Menue-Reiter. */
export const BUILDER_CATEGORIES: Category[] = CATEGORIES.filter((c) => !c.simple);

export function getCategoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
