import { getIngredient, getOption, optionEffects } from "@/lib/catalog";
import type { Category, Cents, Product, Selections } from "@/types/domain";

/**
 * Preisbildung.
 *
 * Grundpreis des Produkts
 *  + Aufpreise der Optionen (Groesse, Teig, Brot)
 *  + Aufpreise der Zutaten x Belagfaktor der Groesse
 *
 * Der Belagfaktor sorgt dafuer, dass Extras auf einer 36-cm-Pizza mehr
 * kosten als auf einer 26er — ohne dass Preise doppelt gepflegt werden.
 */
export interface PriceBreakdown {
  base: Cents;
  options: Cents;
  toppings: Cents;
  unit: Cents;
  /** Einzelposten fuer die Aufschluesselung im UI. */
  lines: Array<{ id: string; name: string; amount: Cents }>;
}

export function priceBuild(
  category: Category,
  product: Product,
  selections: Selections,
): PriceBreakdown {
  const { toppingPriceFactor } = optionEffects(category, selections);
  const lines: PriceBreakdown["lines"] = [];
  let options = 0;
  let toppings = 0;

  for (const group of category.builder.groups) {
    const ids = selections[group.id] ?? [];
    for (const id of ids) {
      if (group.kind === "option") {
        const opt = getOption(id);
        if (!opt || opt.price === 0) continue;
        options += opt.price;
        lines.push({ id, name: opt.name, amount: opt.price });
      } else {
        const ing = getIngredient(id);
        if (!ing || ing.price === 0) continue;
        const amount = Math.round(ing.price * toppingPriceFactor);
        toppings += amount;
        lines.push({ id, name: ing.name, amount });
      }
    }
  }

  return {
    base: product.basePrice,
    options,
    toppings,
    unit: product.basePrice + options + toppings,
    lines,
  };
}

export function lineTotal(unitPrice: Cents, quantity: number): Cents {
  return unitPrice * quantity;
}
