import type { OptionItem, OptionEffect } from "@/types/domain";

/**
 * Optionen sind Auswahlen, die kein sichtbarer Belag sind: Groesse, Teig,
 * Brotsorte, Schaerfe. Ihr `effect` steuert Preislogik und Darstellung.
 */

function opt(
  id: string,
  name: string,
  price: number,
  effect?: OptionEffect,
  o: { description?: string; available?: boolean; unavailableReason?: string } = {},
): OptionItem {
  return {
    id,
    name,
    price,
    description: o.description,
    available: o.available ?? true,
    unavailableReason: o.unavailableReason,
    effect,
  };
}

export const PIZZA_OPTIONS: OptionItem[] = [
  opt("pz-26", "26 cm", 0, { sizeScale: 1, toppingPriceFactor: 1 }, { description: "Fuer einen Hunger." }),
  opt("pz-32", "32 cm", 300, { sizeScale: 1.1, toppingPriceFactor: 1.4 }, { description: "Fuer zwei — oder einen guten Tag." }),
  opt("pz-36", "36 cm", 600, { sizeScale: 1.2, toppingPriceFactor: 1.8 }, { description: "Teilen ausdruecklich erlaubt." }),

  opt("pz-teig-standard", "Standard", 0, { baseVariant: "standard" }, { description: "Luftiger Rand, 48 h gefuehrt." }),
  opt("pz-teig-duenn", "Duenn", 0, { baseVariant: "thin" }, { description: "Knusprig, flacher Rand." }),
  opt("pz-teig-kaeserand", "Kaeserand", 250, { baseVariant: "stuffed" }, { description: "Rand mit Mozzarella gefuellt." }),
];

export const DONER_OPTIONS: OptionItem[] = [
  opt("dn-normal", "Normal", 0, { sizeScale: 1 }),
  opt("dn-gross", "Gross", 150, { sizeScale: 1.09 }, { description: "Mehr Fleisch, mehr Brot." }),

  opt("dn-brot-fladen", "Fladenbrot", 0, { baseVariant: "fladen" }, { description: "Taeglich frisch, im Steinofen aufgebacken." }),
  opt("dn-brot-duerum", "Duerum", 80, { baseVariant: "duerum" }, { description: "Duenn gerollt statt aufgeschnitten." }),
  opt("dn-brot-vollkorn", "Vollkornfladen", 50, { baseVariant: "vollkorn" }),

  opt("dn-schaerfe-0", "Mild", 0, { spice: 0 }),
  opt("dn-schaerfe-1", "Mittel", 0, { spice: 1 }),
  opt("dn-schaerfe-2", "Scharf", 0, { spice: 2 }),
  opt("dn-schaerfe-3", "Sehr scharf", 0, { spice: 3 }, { description: "Wir haben gewarnt." }),
];

export const CROQUE_OPTIONS: OptionItem[] = [
  opt("cq-brot-toast", "Toast", 0, { baseVariant: "toast" }),
  opt("cq-brot-sauerteig", "Sauerteig", 50, { baseVariant: "sauerteig" }, { description: "Kraeftiger, haelt mehr aus." }),
  opt("cq-brot-vollkorn", "Vollkorn", 50, { baseVariant: "vollkorn" }),

  opt("cq-klassisch", "Klassisch", 0, { sizeScale: 1 }),
  opt("cq-double", "Double Decker", 250, { sizeScale: 1.12, baseVariant: "double" }, { description: "Drei Scheiben, zwei Fuellungen." }),
];

export const ALL_OPTIONS: OptionItem[] = [...PIZZA_OPTIONS, ...DONER_OPTIONS, ...CROQUE_OPTIONS];

export const OPTION_INDEX: ReadonlyMap<string, OptionItem> = new Map(ALL_OPTIONS.map((o) => [o.id, o]));
