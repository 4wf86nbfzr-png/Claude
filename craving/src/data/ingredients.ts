import type { AllergenCode, Ingredient, IngredientVisual, Nutrition } from "@/types/domain";

/**
 * Zutatenkatalog.
 *
 * Naehrwerte und Preise sind realistische DEMO-Daten fuer die Testphase und
 * muessen vor dem Live-Gang durch geprueft Werte des Betriebs ersetzt werden
 * (siehe docs/BACKEND.md). Die IDs sind pro Kategorie praefixt:
 *   pz- Pizza, dn- Doener, cq- Croque
 * damit dieselbe Zutat je Produkt eine eigene Darstellung bekommen kann.
 */

interface IngOpts {
  description?: string;
  allergens?: AllergenCode[];
  additives?: string[];
  nutrition?: Nutrition;
  tags?: Ingredient["tags"];
  available?: boolean;
  unavailableReason?: string;
}

function ing(id: string, name: string, price: number, visual: IngredientVisual, o: IngOpts = {}): Ingredient {
  return {
    id,
    name,
    price,
    description: o.description,
    available: o.available ?? true,
    unavailableReason: o.unavailableReason,
    visual,
    allergens: o.allergens ?? [],
    additives: o.additives,
    nutrition: o.nutrition,
    tags: o.tags,
  };
}

const n = (kcal: number, protein: number, carbs: number, fat: number): Nutrition => ({ kcal, protein, carbs, fat });

/* ================================================================== *
 * PIZZA
 * ================================================================== */

export const PIZZA_INGREDIENTS: Ingredient[] = [
  ing("pz-teig", "Pizzateig", 0,
    { z: 0, shape: "base", palette: ["#E4B36B", "#C08A3E", "#F7DCA6", "#B0722C"] },
    { allergens: ["gluten"], nutrition: n(560, 18, 104, 6), description: "Ueber Nacht gefuehrt, 48 Stunden Teigruhe." }),

  ing("pz-tomatensosse", "Tomatensosse", 0,
    { z: 10, shape: "spread", palette: ["#B03420", "#87220F", "#D2523A"] },
    { nutrition: n(45, 2, 8, 1), tags: ["vegan"] }),

  ing("pz-kaese", "Kaese", 0,
    { z: 20, shape: "sheet", palette: ["#E5B03C", "#9A6A12", "#F7DB92"] },
    { allergens: ["milch"], nutrition: n(280, 20, 3, 22), tags: ["vegetarisch"] }),

  ing("pz-salami", "Salami", 150,
    { z: 40, shape: "slice", palette: ["#A83A2E", "#6E1F16", "#C75A4B", "#EFD9C6"], density: 1, scale: 0.92 },
    { allergens: ["senf"], nutrition: n(190, 11, 1, 16), tags: ["beliebt"] }),

  ing("pz-schinken", "Schinken", 150,
    { z: 38, shape: "strip", palette: ["#E09A92", "#BE7168", "#F6CAC4"], density: 0.9 },
    { nutrition: n(110, 15, 1, 5) }),

  ing("pz-sucuk", "Sucuk", 190,
    { z: 41, shape: "slice", palette: ["#8E2B22", "#5C170F", "#B14A3C", "#E8C7A8"], density: 0.85, scale: 0.9 },
    { allergens: ["senf"], nutrition: n(210, 13, 2, 17), tags: ["scharf", "halal"] }),

  ing("pz-haehnchen", "Haehnchen", 190,
    { z: 39, shape: "strip", palette: ["#CFA05F", "#9A6C2E", "#E9C892", "#7E5320"], density: 1.05, scale: 0.7 },
    { nutrition: n(130, 22, 0, 4), tags: ["halal"] }),

  ing("pz-champignons", "Champignons", 120,
    { z: 42, shape: "slice", palette: ["#DCC8AA", "#A08A68", "#F1E4CE"], density: 1, scale: 0.75 },
    { nutrition: n(22, 3, 1, 0), tags: ["vegan"] }),

  ing("pz-paprika", "Paprika", 120,
    // Streifen statt Ringe: so wird Paprika auf der Pizza tatsaechlich geschnitten.
    { z: 43, shape: "shred", palette: ["#C6372B", "#8E1F16", "#E4695A"], density: 0.9, scale: 0.9 },
    { nutrition: n(26, 1, 5, 0), tags: ["vegan"] }),

  ing("pz-zwiebeln", "Zwiebeln", 90,
    { z: 44, shape: "ring", palette: ["#E6DCE6", "#B3A0B6", "#F7F2F7"], density: 1.05, scale: 0.95 },
    { nutrition: n(30, 1, 6, 0), tags: ["vegan"] }),

  ing("pz-oliven", "Oliven", 120,
    { z: 45, shape: "ring", palette: ["#2F2B23", "#151310", "#524939"], density: 1, scale: 0.55 },
    { nutrition: n(115, 1, 3, 11), tags: ["vegan"] }),

  ing("pz-jalapenos", "Jalapenos", 100,
    { z: 46, shape: "ring", palette: ["#4E8F2F", "#2C551A", "#82C258"], density: 1, scale: 0.62 },
    { nutrition: n(28, 1, 4, 0), tags: ["scharf", "vegan"] }),

  ing("pz-mais", "Mais", 90,
    { z: 47, shape: "dice", palette: ["#F2B830", "#CE9016", "#FFD971"], density: 1.3, scale: 0.52 },
    { nutrition: n(86, 3, 19, 1), tags: ["vegan"] }),

  ing("pz-mozzarella", "Mozzarella", 170,
    // Scheiben statt Wuerfel — Wuerfel lasen sich wie Marshmallows.
    { z: 48, shape: "slice", palette: ["#F2EDDF", "#CFC7B4", "#FBF8F0"], density: 0.9, scale: 0.74 },
    { allergens: ["milch"], nutrition: n(240, 18, 2, 18), tags: ["vegetarisch"] }),

  ing("pz-extra-kaese", "Extra Kaese", 150,
    { z: 49, shape: "sheet", palette: ["#E7B443", "#A9741C", "#F4CA6E"] },
    { allergens: ["milch"], nutrition: n(280, 20, 3, 22), tags: ["vegetarisch", "beliebt"] }),

  ing("pz-rucola", "Rucola", 120,
    { z: 70, shape: "leaf", palette: ["#3F6B2B", "#254318", "#6F9E51"], density: 1 },
    { nutrition: n(25, 3, 2, 1), tags: ["vegan", "neu"] }),

  ing("pz-artischocken", "Artischocken", 160,
    { z: 43, shape: "slice", palette: ["#C9CDA4", "#95996F", "#E4E7C8"], density: 0.7, scale: 0.9 },
    { nutrition: n(47, 3, 5, 1), tags: ["vegan"], available: false, unavailableReason: "Heute ausverkauft" }),
];

/* ================================================================== *
 * DOENER
 * ================================================================== */

export const DONER_INGREDIENTS: Ingredient[] = [
  ing("dn-kalb", "Kalbfleisch", 0,
    { z: 24, shape: "strip", palette: ["#7E4A2A", "#4A2614", "#AC754C", "#33190C"], slot: "inside", density: 1.1 },
    { nutrition: n(215, 26, 2, 11), tags: ["halal", "beliebt"], description: "Vom Spiess geschnitten, nicht vorgegart." }),

  ing("dn-haehnchen", "Haehnchen", 0,
    { z: 24, shape: "strip", palette: ["#CE9B5C", "#96683A", "#E9C48D", "#6E4520"], slot: "inside", density: 1.1 },
    { nutrition: n(180, 28, 1, 7), tags: ["halal"] }),

  ing("dn-mix", "Mix (Kalb & Haehnchen)", 80,
    { z: 24, shape: "strip", palette: ["#9A6A3C", "#5E3820", "#C9945F", "#4A2513"], slot: "inside", density: 1.2 },
    { nutrition: n(198, 27, 2, 9), tags: ["halal"] }),

  ing("dn-falafel", "Falafel", 0,
    { z: 24, shape: "dice", palette: ["#8C7A34", "#5C4E1C", "#B7A45A"], slot: "inside", density: 1.1, scale: 1.1 },
    { allergens: ["sesam", "gluten"], nutrition: n(190, 8, 18, 9), tags: ["vegan"] }),

  ing("dn-salat", "Eisbergsalat", 0,
    { z: 22, shape: "shred", palette: ["#9FC463", "#65913C", "#CDE79C"], slot: "inside", density: 1.4 },
    { nutrition: n(14, 1, 3, 0), tags: ["vegan"] }),

  ing("dn-rotkohl", "Rotkohl", 0,
    { z: 22, shape: "shred", palette: ["#7A3B6B", "#4A2040", "#A96096"], slot: "inside", density: 1 },
    { nutrition: n(31, 1, 7, 0), tags: ["vegan"] }),

  ing("dn-weisskohl", "Weisskohl", 0,
    { z: 23, shape: "shred", palette: ["#EDE7D3", "#C7BEA2", "#FBF8EC"], slot: "inside", density: 1 },
    { nutrition: n(28, 1, 6, 0), tags: ["vegan"] }),

  ing("dn-tomate", "Tomate", 0,
    { z: 25, shape: "slice", palette: ["#C63A24", "#8C2011", "#E8705A", "#F6D9A8"], slot: "inside", scale: 0.9 },
    { nutrition: n(18, 1, 4, 0), tags: ["vegan"] }),

  ing("dn-gurke", "Gurke", 0,
    { z: 26, shape: "slice", palette: ["#C9DE93", "#7A9E45", "#E6F2C4", "#5A7F30"], slot: "inside", scale: 0.75 },
    { nutrition: n(12, 1, 2, 0), tags: ["vegan"] }),

  ing("dn-zwiebel", "Zwiebeln", 0,
    { z: 27, shape: "ring", palette: ["#DCD2DC", "#A294A6", "#EFE9EF"], slot: "inside", scale: 0.68, density: 1.2 },
    { nutrition: n(30, 1, 6, 0), tags: ["vegan"] }),

  ing("dn-mais", "Mais", 60,
    { z: 28, shape: "dice", palette: ["#F2B830", "#CE9016", "#FFD971"], slot: "inside", density: 1.5, scale: 0.4 },
    { nutrition: n(86, 3, 19, 1), tags: ["vegan"] }),

  ing("dn-jalapenos", "Jalapenos", 70,
    { z: 28, shape: "ring", palette: ["#4E8F2F", "#2C551A", "#82C258"], slot: "inside", scale: 0.45, density: 0.9 },
    { nutrition: n(28, 1, 4, 0), tags: ["scharf", "vegan"] }),

  ing("dn-kaese", "Kaese", 100,
    { z: 29, shape: "sheet", palette: ["#E9B845", "#A2701A", "#F3CE74"], slot: "inside" },
    { allergens: ["milch"], nutrition: n(280, 20, 3, 22), tags: ["vegetarisch"] }),

  ing("dn-feta", "Feta", 120,
    { z: 29, shape: "dice", palette: ["#F7F4EC", "#D6D0C0", "#FFFFFF"], slot: "inside", scale: 0.8, density: 0.9 },
    { allergens: ["milch"], nutrition: n(260, 14, 4, 21), tags: ["vegetarisch"] }),

  ing("dn-extra-fleisch", "Extra Fleisch", 250,
    { z: 24, shape: "strip", palette: ["#83502F", "#4E2917", "#B07A50", "#33190C"], slot: "inside", density: 0.9 },
    { nutrition: n(215, 26, 2, 11), tags: ["halal", "beliebt"] }),

  ing("dn-sosse-kraeuter", "Kraeutersosse", 0,
    { z: 50, shape: "sauce", palette: ["#F1F0E0", "#D3D2BC", "#FFFFFF", "#6E9440"], slot: "inside" },
    { allergens: ["milch", "ei"], nutrition: n(190, 2, 4, 18), tags: ["beliebt"] }),

  ing("dn-sosse-knoblauch", "Knoblauchsosse", 0,
    { z: 51, shape: "sauce", palette: ["#F8F6ED", "#DCD8C6", "#FFFFFF"], slot: "inside" },
    { allergens: ["milch", "ei"], nutrition: n(200, 2, 3, 20), tags: ["beliebt"] }),

  ing("dn-sosse-scharf", "Scharfe Sosse", 0,
    { z: 52, shape: "sauce", palette: ["#C0392B", "#84200F", "#E06450"], slot: "inside" },
    { nutrition: n(70, 1, 8, 4), tags: ["scharf", "vegan"] }),

  ing("dn-sosse-cocktail", "Cocktailsosse", 0,
    { z: 53, shape: "sauce", palette: ["#E9A08C", "#C1735C", "#F7C7B8"], slot: "inside" },
    { allergens: ["ei", "senf"], nutrition: n(180, 1, 12, 14) }),
];

/* ================================================================== *
 * CROQUE
 * ================================================================== */

export const CROQUE_INGREDIENTS: Ingredient[] = [
  ing("cq-gouda", "Gouda", 0,
    { z: 20, shape: "sheet", palette: ["#F0C463", "#D3A03F", "#FFE9AC"], slot: "inside" },
    { allergens: ["milch"], nutrition: n(280, 20, 3, 22), tags: ["vegetarisch", "beliebt"] }),

  ing("cq-emmentaler", "Emmentaler", 40,
    { z: 20, shape: "sheet", palette: ["#F5DA9A", "#D9B96C", "#FFF0C6"], slot: "inside" },
    { allergens: ["milch"], nutrition: n(300, 25, 1, 23), tags: ["vegetarisch"] }),

  ing("cq-mozzarella", "Mozzarella", 60,
    { z: 21, shape: "sheet", palette: ["#F7F4EC", "#DAD4C6", "#FFFFFF"], slot: "inside" },
    { allergens: ["milch"], nutrition: n(240, 18, 2, 18), tags: ["vegetarisch"] }),

  ing("cq-schinken", "Schinken", 130,
    { z: 30, shape: "sheet", palette: ["#E09A92", "#B96D64", "#F6CAC4"], slot: "inside" },
    { nutrition: n(110, 15, 1, 5), tags: ["beliebt"] }),

  ing("cq-salami", "Salami", 130,
    { z: 30, shape: "slice", palette: ["#A83A2E", "#77231A", "#C75A4B", "#F0DCCB"], slot: "inside", density: 0.8 },
    { allergens: ["senf"], nutrition: n(190, 11, 1, 16) }),

  ing("cq-sucuk", "Sucuk", 170,
    { z: 30, shape: "slice", palette: ["#8E2B22", "#5C170F", "#B14A3C"], slot: "inside", density: 0.8, scale: 0.9 },
    { allergens: ["senf"], nutrition: n(210, 13, 2, 17), tags: ["scharf", "halal"] }),

  ing("cq-haehnchen", "Haehnchen", 170,
    { z: 30, shape: "strip", palette: ["#D2A163", "#98703A", "#EDCE9A", "#7A5322"], slot: "inside", density: 1 },
    { nutrition: n(130, 22, 0, 4), tags: ["halal"] }),

  ing("cq-bacon", "Bacon", 150,
    { z: 31, shape: "strip", palette: ["#A84C3A", "#6E2A1E", "#EFD3C4"], slot: "inside", density: 0.9 },
    { nutrition: n(320, 20, 1, 26) }),

  ing("cq-tomate", "Tomate", 60,
    { z: 25, shape: "slice", palette: ["#C63A24", "#8C2011", "#E8705A", "#F6D9A8"], slot: "inside", scale: 0.95 },
    { nutrition: n(18, 1, 4, 0), tags: ["vegan"] }),

  ing("cq-zwiebeln", "Zwiebeln", 50,
    { z: 26, shape: "ring", palette: ["#E6DCE6", "#B3A0B6", "#F7F2F7"], slot: "inside", scale: 0.8 },
    { nutrition: n(30, 1, 6, 0), tags: ["vegan"] }),

  ing("cq-champignons", "Champignons", 90,
    { z: 26, shape: "slice", palette: ["#DCC8AA", "#A28A6A", "#F1E4CE"], slot: "inside", scale: 0.7 },
    { nutrition: n(22, 3, 1, 0), tags: ["vegan"] }),

  ing("cq-spinat", "Blattspinat", 80,
    { z: 27, shape: "leaf", palette: ["#3F6B2B", "#254318", "#6F9E51"], slot: "inside" },
    { nutrition: n(23, 3, 1, 0), tags: ["vegan"] }),

  ing("cq-jalapenos", "Jalapenos", 70,
    { z: 28, shape: "ring", palette: ["#4E8F2F", "#2C551A", "#82C258"], slot: "inside", scale: 0.45 },
    { nutrition: n(28, 1, 4, 0), tags: ["scharf", "vegan"] }),

  ing("cq-ei", "Spiegelei", 120,
    { z: 40, shape: "sheet", palette: ["#FDF6E4", "#E6DCC2", "#FFFFFF", "#F2B830"], slot: "top" },
    { allergens: ["ei"], nutrition: n(155, 13, 1, 11), tags: ["vegetarisch"] }),

  ing("cq-extra-kaese", "Extra Kaese", 130,
    { z: 41, shape: "sheet", palette: ["#EFBE55", "#CE9A38", "#FFE7A0"], slot: "top" },
    { allergens: ["milch"], nutrition: n(280, 20, 3, 22), tags: ["vegetarisch", "beliebt"] }),

  ing("cq-sosse-remoulade", "Remoulade", 0,
    { z: 15, shape: "spread", palette: ["#F6F1DC", "#D9D2B6", "#FFFFFF", "#8FA854"], slot: "inside" },
    { allergens: ["ei", "senf"], nutrition: n(210, 1, 5, 21) }),

  ing("cq-sosse-bbq", "BBQ", 0,
    { z: 15, shape: "spread", palette: ["#5E2C18", "#38180C", "#8A4A2A"], slot: "inside" },
    { allergens: ["senf", "sellerie"], nutrition: n(120, 1, 26, 1), tags: ["vegan"] }),

  ing("cq-sosse-kraeuter", "Kraeutersosse", 0,
    { z: 15, shape: "spread", palette: ["#F1F0E0", "#D0CFB8", "#FFFFFF", "#6E9440"], slot: "inside" },
    { allergens: ["milch", "ei"], nutrition: n(190, 2, 4, 18) }),

  ing("cq-sosse-chili", "Chilisosse", 0,
    { z: 15, shape: "spread", palette: ["#C0392B", "#84200F", "#E06450"], slot: "inside" },
    { nutrition: n(80, 1, 14, 2), tags: ["scharf", "vegan"] }),
];

export const ALL_INGREDIENTS: Ingredient[] = [
  ...PIZZA_INGREDIENTS,
  ...DONER_INGREDIENTS,
  ...CROQUE_INGREDIENTS,
];

export const INGREDIENT_INDEX: ReadonlyMap<string, Ingredient> = new Map(
  ALL_INGREDIENTS.map((i) => [i.id, i]),
);
