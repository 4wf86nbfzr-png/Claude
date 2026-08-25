"use client";

import { Sheet } from "@/components/ui/Sheet";
import { ALLERGEN_INDEX, ADDITIVE_INDEX } from "@/data/allergens";
import type { Ingredient, Nutrition } from "@/types/domain";

/** Summe der Naehrwerte aller gewaehlten Zutaten (Demo-Werte). */
export function sumNutrition(ingredients: Ingredient[]): Nutrition {
  return ingredients.reduce<Nutrition>(
    (acc, i) => {
      if (!i.nutrition) return acc;
      return {
        kcal: acc.kcal + i.nutrition.kcal,
        protein: acc.protein + i.nutrition.protein,
        carbs: acc.carbs + i.nutrition.carbs,
        fat: acc.fat + i.nutrition.fat,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function collectAllergens(ingredients: Ingredient[]): string[] {
  const codes = new Set<string>();
  for (const i of ingredients) for (const a of i.allergens) codes.add(a);
  return [...codes].map((c) => ALLERGEN_INDEX.get(c as never)?.label ?? c).sort();
}

/** Kompakte Naehrwertzeile unter der Buehne. */
export function NutritionBar({ ingredients }: { ingredients: Ingredient[] }) {
  const n = sumNutrition(ingredients);
  const rows = [
    { label: "kcal", value: Math.round(n.kcal) },
    { label: "Eiweiss", value: `${Math.round(n.protein)} g` },
    { label: "Kohlenhydrate", value: `${Math.round(n.carbs)} g` },
    { label: "Fett", value: `${Math.round(n.fat)} g` },
  ];
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline gap-1.5">
          <dt className="text-[0.6875rem] text-muted">{r.label}</dt>
          <dd className="num text-sm font-semibold">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function IngredientInfoSheet({
  ingredient,
  onClose,
}: {
  ingredient: Ingredient | null;
  onClose: () => void;
}) {
  const allergens = ingredient?.allergens.map((c) => ALLERGEN_INDEX.get(c)?.label ?? c) ?? [];
  const additives = ingredient?.additives?.map((c) => ADDITIVE_INDEX.get(c)?.label ?? c) ?? [];

  return (
    <Sheet
      open={Boolean(ingredient)}
      onClose={onClose}
      title={ingredient?.name ?? ""}
      description={ingredient?.description}
    >
      {ingredient && (
        <div className="space-y-6">
          <section>
            <h3 className="kicker mb-3">Naehrwerte je Portion</h3>
            <NutritionBar ingredients={[ingredient]} />
            <p className="mt-3 text-xs text-muted">
              Demo-Werte der Testphase. Vor dem Live-Gang durch die gepruefte
              Naehrwerttabelle des Betriebs ersetzen.
            </p>
          </section>

          <section>
            <h3 className="kicker mb-3">Allergene</h3>
            {allergens.length ? (
              <ul className="flex flex-wrap gap-2">
                {allergens.map((a) => (
                  <li key={a} className="rounded-full border border-line bg-ink-3 px-3 py-1.5 text-xs">
                    {a}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Keine kennzeichnungspflichtigen Allergene hinterlegt.</p>
            )}
          </section>

          {additives.length > 0 && (
            <section>
              <h3 className="kicker mb-3">Zusatzstoffe</h3>
              <ul className="flex flex-wrap gap-2">
                {additives.map((a) => (
                  <li key={a} className="rounded-full border border-line bg-ink-3 px-3 py-1.5 text-xs">
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs leading-relaxed text-muted">
            Spuren anderer Allergene lassen sich in einer offenen Kueche nicht
            ausschliessen. Bei Unvertraeglichkeiten bitte vor der Bestellung anrufen.
          </p>
        </div>
      )}
    </Sheet>
  );
}
