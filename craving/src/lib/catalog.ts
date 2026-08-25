import { CATEGORY_INDEX, CATEGORIES } from "@/data/categories";
import { INGREDIENT_INDEX } from "@/data/ingredients";
import { OPTION_INDEX } from "@/data/options";
import { PRODUCT_INDEX, PRODUCTS } from "@/data/products";
import type {
  Category, Choice, ChoiceGroup, Ingredient, OptionItem, Product, Selections,
} from "@/types/domain";

/** Einheitliche Sicht auf Zutat ODER Option — das UI muss nicht unterscheiden. */
export type ChoiceView = Choice & {
  kind: "ingredient" | "option";
  ingredient?: Ingredient;
  option?: OptionItem;
};

export function getIngredient(id: string): Ingredient | undefined {
  return INGREDIENT_INDEX.get(id);
}

export function getOption(id: string): OptionItem | undefined {
  return OPTION_INDEX.get(id);
}

export function getProduct(id: string): Product | undefined {
  return PRODUCT_INDEX.get(id);
}

export function getCategory(id: string): Category | undefined {
  return CATEGORY_INDEX.get(id);
}

export function findProduct(categoryId: string, slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.categoryId === categoryId && p.slug === slug);
}

export function getGroup(category: Category, groupId: string): ChoiceGroup | undefined {
  return category.builder.groups.find((g) => g.id === groupId);
}

export function choiceView(group: ChoiceGroup, id: string): ChoiceView | undefined {
  if (group.kind === "ingredient") {
    const ingredient = getIngredient(id);
    return ingredient ? { ...ingredient, kind: "ingredient", ingredient } : undefined;
  }
  const option = getOption(id);
  return option ? { ...option, kind: "option", option } : undefined;
}

export function groupMembers(group: ChoiceGroup): ChoiceView[] {
  return group.memberIds
    .map((id) => choiceView(group, id))
    .filter((c): c is ChoiceView => Boolean(c));
}

/** Alle gewaehlten Zutaten eines Builder-Zustands, sortiert nach Stapelebene. */
export function selectedIngredients(category: Category, selections: Selections): Ingredient[] {
  const out: Ingredient[] = [];
  for (const group of category.builder.groups) {
    if (group.kind !== "ingredient") continue;
    for (const id of selections[group.id] ?? []) {
      const ing = getIngredient(id);
      if (ing) out.push(ing);
    }
  }
  return out.sort((a, b) => a.visual.z - b.visual.z);
}

export function selectedOptions(category: Category, selections: Selections): OptionItem[] {
  const out: OptionItem[] = [];
  for (const group of category.builder.groups) {
    if (group.kind !== "option") continue;
    for (const id of selections[group.id] ?? []) {
      const opt = getOption(id);
      if (opt) out.push(opt);
    }
  }
  return out;
}

/** Zusammengefasster Effekt aller gewaehlten Optionen. */
export function optionEffects(category: Category, selections: Selections) {
  let sizeScale = 1;
  let toppingPriceFactor = 1;
  let spice = 0;
  const variants: string[] = [];
  for (const opt of selectedOptions(category, selections)) {
    const e = opt.effect;
    if (!e) continue;
    if (e.sizeScale) sizeScale *= e.sizeScale;
    if (e.toppingPriceFactor) toppingPriceFactor *= e.toppingPriceFactor;
    if (typeof e.spice === "number") spice = Math.max(spice, e.spice);
    if (e.baseVariant) variants.push(e.baseVariant);
  }
  return { sizeScale, toppingPriceFactor, spice, variants };
}

/** Startzustand eines Builders: Produkt-Preset, ergaenzt um Gruppen-Defaults. */
export function initialSelections(category: Category, product?: Product): Selections {
  const out: Selections = {};
  for (const group of category.builder.groups) {
    const fromProduct = product?.preset[group.id];
    out[group.id] = fromProduct ? [...fromProduct] : [...(group.defaultIds ?? [])];
  }
  return out;
}

/** Was der Nutzer gegenueber dem Produkt-Preset geaendert hat. */
export function diffSelections(product: Product, selections: Selections) {
  const added: string[] = [];
  const removed: string[] = [];
  const presetGroups = new Set([...Object.keys(product.preset), ...Object.keys(selections)]);
  for (const groupId of presetGroups) {
    const before = new Set(product.preset[groupId] ?? []);
    const after = new Set(selections[groupId] ?? []);
    for (const id of after) if (!before.has(id)) added.push(id);
    for (const id of before) if (!after.has(id)) removed.push(id);
  }
  return { added, removed };
}

/** Anzeigename einer beliebigen Auswahl-ID (Warenkorb, Bestellung). */
export function labelFor(id: string): string {
  return getIngredient(id)?.name ?? getOption(id)?.name ?? id;
}

export function allCategories(): Category[] {
  return [...CATEGORIES].sort((a, b) => a.order - b.order);
}
