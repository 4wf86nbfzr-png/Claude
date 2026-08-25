import type { Additive, Allergen, AllergenCode } from "@/types/domain";

/** Die 14 kennzeichnungspflichtigen Allergene (LMIV, Anlage 2 LMIDV). */
export const ALLERGENS: Allergen[] = [
  { code: "gluten", label: "Glutenhaltiges Getreide" },
  { code: "krebstiere", label: "Krebstiere" },
  { code: "ei", label: "Eier" },
  { code: "fisch", label: "Fisch" },
  { code: "erdnuss", label: "Erdnuesse" },
  { code: "soja", label: "Soja" },
  { code: "milch", label: "Milch (inkl. Laktose)" },
  { code: "schalenfruechte", label: "Schalenfruechte" },
  { code: "sellerie", label: "Sellerie" },
  { code: "senf", label: "Senf" },
  { code: "sesam", label: "Sesam" },
  { code: "sulfite", label: "Schwefeldioxid und Sulfite" },
  { code: "lupine", label: "Lupinen" },
  { code: "weichtiere", label: "Weichtiere" },
];

export const ALLERGEN_INDEX: ReadonlyMap<AllergenCode, Allergen> = new Map(
  ALLERGENS.map((a) => [a.code, a]),
);

/** Zusatzstoffe nach ZZulV — Demo-Auswahl, vor Live-Gang pruefen. */
export const ADDITIVES: Additive[] = [
  { code: "1", label: "mit Farbstoff" },
  { code: "2", label: "mit Konservierungsstoff" },
  { code: "3", label: "mit Antioxidationsmittel" },
  { code: "4", label: "mit Geschmacksverstaerker" },
  { code: "5", label: "geschwefelt" },
  { code: "8", label: "mit Phosphat" },
];

export const ADDITIVE_INDEX: ReadonlyMap<string, Additive> = new Map(
  ADDITIVES.map((a) => [a.code, a]),
);
