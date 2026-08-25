import { getIngredient, getCategory, getProduct } from "@/lib/catalog";
import { findZone } from "@/lib/delivery";
import { openingState } from "@/lib/opening";
import type { Address, CartItem, Category, Customer, Selections } from "@/types/domain";

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const RE_PHONE = /^[+0][0-9\s/()-]{6,20}$/;
const RE_PLZ = /^\d{5}$/;

export function validateCustomer(c: Partial<Customer>): FieldErrors<Customer> {
  const e: FieldErrors<Customer> = {};
  if (!c.firstName?.trim()) e.firstName = "Bitte Vornamen angeben.";
  if (!c.lastName?.trim()) e.lastName = "Bitte Nachnamen angeben.";
  if (!c.email?.trim()) e.email = "Ohne E-Mail koennen wir die Bestaetigung nicht schicken.";
  else if (!RE_EMAIL.test(c.email)) e.email = "Diese E-Mail-Adresse sieht nicht vollstaendig aus.";
  if (!c.phone?.trim()) e.phone = "Der Fahrer braucht eine Nummer.";
  else if (!RE_PHONE.test(c.phone)) e.phone = "Bitte eine erreichbare Telefonnummer angeben.";
  return e;
}

export function validateAddress(a: Partial<Address>): FieldErrors<Address> {
  const e: FieldErrors<Address> = {};
  if (!a.street?.trim()) e.street = "Bitte Strasse angeben.";
  if (!a.houseNumber?.trim()) e.houseNumber = "Hausnummer fehlt.";
  if (!a.postalCode?.trim()) e.postalCode = "Bitte PLZ angeben.";
  else if (!RE_PLZ.test(a.postalCode.trim())) e.postalCode = "Eine deutsche PLZ hat fuenf Ziffern.";
  else if (!findZone(a.postalCode)) e.postalCode = "Diese PLZ liegt ausserhalb unseres Liefergebiets.";
  if (!a.city?.trim()) e.city = "Bitte Ort angeben.";
  return e;
}

export function hasErrors(errors: Record<string, unknown>): boolean {
  return Object.keys(errors).length > 0;
}

/** Pflichtgruppen eines Builders — was fehlt noch? */
export function missingRequirements(category: Category, selections: Selections): string[] {
  const problems: string[] = [];
  for (const group of category.builder.groups) {
    const chosen = selections[group.id] ?? [];
    if (group.min && chosen.length < group.min) {
      problems.push(
        group.min === 1
          ? `${group.label}: bitte etwas auswaehlen.`
          : `${group.label}: mindestens ${group.min} auswaehlen.`,
      );
    }
    if (group.max && chosen.length > group.max) {
      problems.push(`${group.label}: hoechstens ${group.max} moeglich.`);
    }
  }
  return problems;
}

export type PreflightCode =
  | "empty_cart" | "closed" | "min_order" | "outside_zone" | "sold_out";

export interface PreflightIssue {
  code: PreflightCode;
  message: string;
  /** Betroffene Warenkorbzeilen. */
  itemIds?: string[];
}

/**
 * Pruefung direkt vor dem Checkout (Spezifikation Abschnitt 36):
 * Verfuegbarkeit, Mindestbestellwert, Liefergebiet, Oeffnung.
 */
export function preflight(args: {
  items: CartItem[];
  fulfillment: "delivery" | "pickup";
  postalCode?: string;
  minOrderMet: boolean;
  missingForMinOrder: number;
  now?: Date;
  allowPreorder?: boolean;
}): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  if (args.items.length === 0) {
    issues.push({ code: "empty_cart", message: "Der Warenkorb ist leer." });
    return issues;
  }

  const soldOut: string[] = [];
  for (const item of args.items) {
    const product = getProduct(item.productId);
    const category = getCategory(item.categoryId);
    if (product && !product.available) soldOut.push(item.id);
    if (!category) continue;
    for (const ids of Object.values(item.selections)) {
      for (const id of ids) {
        const ing = getIngredient(id);
        if (ing && !ing.available && !soldOut.includes(item.id)) soldOut.push(item.id);
      }
    }
  }
  if (soldOut.length) {
    issues.push({
      code: "sold_out",
      message: "Etwas in deinem Warenkorb ist gerade nicht verfuegbar. Bitte anpassen.",
      itemIds: soldOut,
    });
  }

  const state = openingState(args.now ?? new Date());
  if (!state.open && !args.allowPreorder) {
    issues.push({ code: "closed", message: "Wir haben gerade geschlossen — Vorbestellung ist moeglich." });
  }

  if (args.fulfillment === "delivery") {
    if (!args.postalCode || !findZone(args.postalCode)) {
      issues.push({ code: "outside_zone", message: "Fuer diese Adresse liefern wir nicht." });
    } else if (!args.minOrderMet) {
      issues.push({
        code: "min_order",
        message: `Es fehlen noch ${(args.missingForMinOrder / 100).toFixed(2).replace(".", ",")} € bis zum Mindestbestellwert.`,
      });
    }
  }

  return issues;
}
