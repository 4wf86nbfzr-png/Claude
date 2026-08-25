"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, ListChecks } from "lucide-react";
import { CustomizationPanel } from "./CustomizationPanel";
import { FoodPreview } from "./FoodPreview";
import { NutritionBar, collectAllergens } from "./NutritionInfo";
import { PriceCalculator } from "./PriceCalculator";
import { CartButton } from "./CartButton";
import { StepRail } from "./StepRail";
import { Button } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Sheet } from "@/components/ui/Sheet";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import {
  diffSelections, getGroup, initialSelections, optionEffects, selectedIngredients,
} from "@/lib/catalog";
import { priceBuild } from "@/lib/pricing";
import { missingRequirements } from "@/lib/validation";
import { productsOfCategory } from "@/data/products";
import { useAccountStore } from "@/stores/account-store";
import { playTone } from "@/lib/sound";
import { useCartStore } from "@/stores/cart-store";
import { useUiStore } from "@/stores/ui-store";
import type { Category, Product, Selections } from "@/types/domain";

/**
 * Der Builder haelt den gesamten Konfigurationszustand.
 *
 * Alles Abgeleitete (Zutatenebenen, Optionswirkungen, Preis) wird aus
 * `selections` berechnet, nichts doppelt gespeichert — damit koennen
 * Favoriten und Warenkorbzeilen einfach dieselbe Struktur transportieren.
 */
export function FoodBuilder({
  category,
  product: initialProduct,
  presetSelections,
  editLineId,
}: {
  category: Category;
  product: Product;
  presetSelections?: Selections;
  editLineId?: string;
}) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [selections, setSelections] = useState<Selections>(
    () => presetSelections ?? initialSelections(category, initialProduct),
  );
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [favOpen, setFavOpen] = useState(false);
  const [favName, setFavName] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const stepIds = useMemo(() => category.builder.steps.map((s) => s.id), [category]);
  const activeStep = useScrollSpy(stepIds);

  const saveFavorite = useAccountStore((s) => s.saveFavorite);
  const soundEnabled = useAccountStore((s) => s.soundEnabled);
  const updateLine = useCartStore((s) => s.update);
  const toast = useUiStore((s) => s.toast);

  const ingredients = useMemo(() => selectedIngredients(category, selections), [category, selections]);
  const effects = useMemo(() => optionEffects(category, selections), [category, selections]);
  const breakdown = useMemo(() => priceBuild(category, product, selections), [category, product, selections]);
  const problems = useMemo(() => missingRequirements(category, selections), [category, selections]);
  const diff = useMemo(() => diffSelections(product, selections), [product, selections]);
  const allergens = useMemo(() => collectAllergens(ingredients), [ingredients]);

  const completed = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const step of category.builder.steps) {
      map[step.id] = step.groupIds.every((groupId) => {
        const group = getGroup(category, groupId);
        if (!group) return true;
        const chosen = selections[groupId] ?? [];
        return group.min ? chosen.length >= group.min : chosen.length > 0;
      });
    }
    return map;
  }, [category, selections]);

  const toggle = (groupId: string, id: string) => {
    const group = getGroup(category, groupId);
    if (!group) return;
    navigator.vibrate?.(6);
    playTone("tick", soundEnabled);

    setSelections((prev) => {
      const current = prev[groupId] ?? [];
      if (group.selection === "single") {
        if (current.includes(id)) {
          // Pflichtgruppen (Groesse, Brot) lassen sich nicht leeren.
          return group.min ? prev : { ...prev, [groupId]: [] };
        }
        return { ...prev, [groupId]: [id] };
      }
      if (current.includes(id)) {
        return { ...prev, [groupId]: current.filter((x) => x !== id) };
      }
      if (group.max !== undefined && current.length >= group.max) return prev;
      return { ...prev, [groupId]: [...current, id] };
    });
  };

  const applyPreset = (next: Product) => {
    setProduct(next);
    setSelections(initialSelections(category, next));
    document.getElementById(category.builder.steps[0]?.id ?? "")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cartItem = {
    productId: product.id,
    categoryId: category.id,
    name: product.freestyle ? `${category.name} nach Wahl` : product.name,
    unitPrice: breakdown.unit,
    selections,
    added: diff.added,
    removed: diff.removed,
    note: note.trim() || undefined,
  };

  const blocked = problems.length > 0;

  const applyEdit = () => {
    if (!editLineId) return;
    updateLine(editLineId, { ...cartItem, quantity });
    toast({ title: "Aenderungen uebernommen", tone: "success" });
    router.push("/warenkorb");
  };

  return (
    <div className="lg:grid lg:min-h-[calc(100dvh-5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(30rem,42%)] xl:grid-cols-[minmax(0,1fr)_minmax(34rem,38%)]">
      {/* Buehne */}
      <div className="sticky top-16 z-30 -mx-[clamp(1.25rem,4vw,4.5rem)] bg-ink/85 px-[clamp(1.25rem,4vw,4.5rem)] pb-3 pt-4 backdrop-blur-lg lg:static lg:mx-0 lg:flex lg:h-[calc(100dvh-5rem)] lg:flex-col lg:justify-center lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:backdrop-blur-none">
        <div className="h-[30vh] sm:h-[34vh] lg:h-auto lg:flex-1">
          <FoodPreview
            ref={previewRef}
            categoryId={category.id}
            ingredients={ingredients}
            effects={effects}
            accent={category.accent}
            label={`${product.name} mit ${ingredients.map((i) => i.name).join(", ") || "Grundzutaten"}`}
          />
        </div>

        <div className="mt-3 hidden lg:block">
          <NutritionBar ingredients={ingredients} />
          {allergens.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              <span className="text-chrome">Allergene:</span> {allergens.join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Konfiguration */}
      <div className="lg:border-l lg:border-line lg:pl-10 xl:pl-14">
        <div className="sticky top-[calc(4rem+30vh+0.75rem)] z-20 -mx-[clamp(1.25rem,4vw,4.5rem)] border-y border-line bg-ink/90 px-[clamp(1.25rem,4vw,4.5rem)] py-2.5 backdrop-blur-lg sm:top-[calc(4rem+34vh+0.75rem)] lg:top-20 lg:mx-0 lg:border-x-0 lg:border-t-0 lg:px-0 lg:pt-6">
          <StepRail
            steps={category.builder.steps}
            activeId={activeStep}
            completed={completed}
            accent={category.accent}
            onJump={jumpTo}
          />
        </div>

        <div className="pb-40 pt-10 lg:pb-32">
          <CustomizationPanel
            category={category}
            product={product}
            selections={selections}
            presets={productsOfCategory(category.id)}
            accent={category.accent}
            note={note}
            onToggle={toggle}
            onPreset={applyPreset}
            onNote={setNote}
          />

          <div className="mt-10 flex flex-wrap gap-3 lg:hidden">
            <Button variant="quiet" size="sm" onClick={() => setSummaryOpen(true)}>
              <ListChecks className="size-4" aria-hidden />
              Zusammenfassung
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setFavOpen(true)}>
              <Heart className="size-4" aria-hidden />
              Merken
            </Button>
          </div>

          <div className="mt-10 hidden lg:flex lg:flex-wrap lg:gap-3">
            <Button variant="quiet" size="sm" onClick={() => setFavOpen(true)}>
              <Heart className="size-4" aria-hidden />
              Als Favorit speichern
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setSummaryOpen(true)}>
              <ListChecks className="size-4" aria-hidden />
              Zusammenfassung
            </Button>
          </div>
        </div>
      </div>

      {/* Abschlussleiste */}
      <div className="fixed inset-x-0 bottom-16 z-40 border-t border-line bg-ink/95 px-[clamp(1.25rem,4vw,4.5rem)] py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl lg:bottom-0 lg:left-auto lg:right-0 lg:w-[42%] lg:px-10 lg:py-5 xl:w-[38%] xl:px-14">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <PriceCalculator breakdown={breakdown} quantity={quantity} productName={cartItem.name} />
          </div>
          <QuantityStepper value={quantity} onChange={setQuantity} size="sm" />
        </div>
        <div className="mt-3">
          {editLineId ? (
            <Button size="lg" className="w-full" onClick={applyEdit} disabled={blocked}>
              Aenderungen uebernehmen
            </Button>
          ) : (
            <CartButton
              item={cartItem}
              quantity={quantity}
              previewRef={previewRef}
              disabled={blocked}
              blockReason={problems[0]}
            />
          )}
        </div>
      </div>

      {/* Favorit speichern */}
      <Sheet
        open={favOpen}
        onClose={() => setFavOpen(false)}
        title="Konfiguration merken"
        description="Beim naechsten Mal mit einem Tippen wieder da."
        footer={
          <Button
            className="w-full"
            onClick={() => {
              saveFavorite({
                label: favName.trim() || `Mein ${category.name}`,
                productId: product.id,
                categoryId: category.id,
                selections,
              });
              setFavOpen(false);
              setFavName("");
              toast({ title: "Gemerkt", description: "Zu finden unter Konto → Favoriten.", tone: "success" });
            }}
          >
            Speichern
          </Button>
        }
      >
        <label className="block text-sm font-medium" htmlFor="fav-name">
          Name
        </label>
        <input
          id="fav-name"
          value={favName}
          onChange={(e) => setFavName(e.target.value.slice(0, 40))}
          placeholder={`Mein ${category.name}`}
          className="mt-2 w-full rounded-xl border border-line bg-ink-3 p-3.5 text-sm placeholder:text-muted focus:border-line-strong focus:outline-none"
        />
      </Sheet>

      {/* Zusammenfassung */}
      <Sheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title={cartItem.name}
        description="Alles, was drin ist."
      >
        <div className="space-y-6">
          <section>
            <h3 className="kicker mb-2">Zutaten</h3>
            <ul className="flex flex-wrap gap-2">
              {ingredients.map((i) => (
                <li key={i.id} className="rounded-full border border-line bg-ink-3 px-3 py-1.5 text-xs">
                  {i.name}
                </li>
              ))}
            </ul>
          </section>
          {diff.removed.length > 0 && (
            <section>
              <h3 className="kicker mb-2">Abgewaehlt</h3>
              <p className="text-sm text-muted">ohne {diff.removed.length} Zutat(en) der Vorlage</p>
            </section>
          )}
          <section>
            <h3 className="kicker mb-2">Naehrwerte (Demo)</h3>
            <NutritionBar ingredients={ingredients} />
          </section>
          {allergens.length > 0 && (
            <section>
              <h3 className="kicker mb-2">Allergene</h3>
              <p className="text-sm text-chrome">{allergens.join(", ")}</p>
            </section>
          )}
        </div>
      </Sheet>
    </div>
  );
}
