"use client";

import { useRef, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { ChoiceCard } from "./ChoiceCard";
import { IngredientChip } from "./IngredientChip";
import { IngredientInfoSheet } from "./NutritionInfo";
import { groupMembers } from "@/lib/catalog";
import type { ChoiceGroup, Ingredient } from "@/types/domain";

/**
 * Eine Auswahlgruppe.
 *
 * Zutaten erscheinen als Bilder in einer Wischleiste — man sieht, was man
 * nimmt, und legt es mit einem Tippen oder einer Wischgeste aufs Produkt.
 * Optionen (Groesse, Teig, Brot, Schaerfe) bleiben Textkarten: dort gibt es
 * nichts zu sehen, nur zu entscheiden.
 *
 * Regeln (einfach/mehrfach, min/max) kommen aus den Daten, nicht aus dem UI.
 */
export function IngredientSelector({
  group,
  selected,
  accent,
  onToggle,
}: {
  group: ChoiceGroup;
  selected: string[];
  accent: string;
  onToggle: (id: string) => void;
}) {
  const [info, setInfo] = useState<Ingredient | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const members = groupMembers(group);
  const atMax = group.max !== undefined && selected.length >= group.max;
  const belowMin = group.min !== undefined && selected.length < group.min;

  const scrollRail = (direction: -1 | 1) => {
    railRef.current?.scrollBy({ left: direction * 260, behavior: "smooth" });
  };

  const header = (
    <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 id={`group-${group.id}`} className="text-base font-bold tracking-tight">
        {group.label}
      </h3>
      <p className="text-xs text-muted">
        {group.hint ??
          (group.selection === "single"
            ? "Eine Auswahl"
            : group.max
              ? `Bis zu ${group.max}`
              : "Mehrfach moeglich")}
      </p>
    </header>
  );

  const warning = belowMin && (
    <p className="mb-3 flex items-center gap-1.5 text-xs text-saffron" role="status">
      <AlertCircle className="size-3.5" aria-hidden />
      {group.min === 1 ? "Bitte etwas auswaehlen." : `Mindestens ${group.min} auswaehlen.`}
    </p>
  );

  if (group.kind === "option") {
    return (
      <section aria-labelledby={`group-${group.id}`} className="scroll-mt-28">
        {header}
        {warning}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
          {members.map((choice) => (
            <ChoiceCard
              key={choice.id}
              choice={choice}
              selected={selected.includes(choice.id)}
              accent={accent}
              onToggle={() => onToggle(choice.id)}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby={`group-${group.id}`} className="scroll-mt-28">
      {header}
      {warning}

      <div className="relative">
        <div
          ref={railRef}
          data-rail
          className="no-scrollbar edge-scroll -mx-1 flex gap-3 overflow-x-auto px-1 pb-1"
        >
          {members.map((choice) => {
            const ingredient = choice.ingredient;
            if (!ingredient) return null;
            const isSelected = selected.includes(choice.id);
            return (
              <div key={choice.id} className="snap-start">
                <IngredientChip
                  ingredient={ingredient}
                  selected={isSelected}
                  disabled={!isSelected && atMax && group.selection === "multiple"}
                  accent={accent}
                  onToggle={() => {
                    if (!isSelected && atMax && group.selection === "multiple") return;
                    onToggle(choice.id);
                  }}
                  onInfo={() => setInfo(ingredient)}
                />
              </div>
            );
          })}
        </div>

        {/* Blaetterknoepfe: nur mit Maus sichtbar, auf dem Telefon wird gewischt. */}
        <button
          type="button"
          onClick={() => scrollRail(-1)}
          className="absolute -left-3 top-[2.2rem] hidden size-8 place-items-center rounded-full border border-line bg-ink/90 text-muted backdrop-blur transition hover:text-paper lg:grid"
          aria-label="Zutaten nach links"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => scrollRail(1)}
          className="absolute -right-3 top-[2.2rem] hidden size-8 place-items-center rounded-full border border-line bg-ink/90 text-muted backdrop-blur transition hover:text-paper lg:grid"
          aria-label="Zutaten nach rechts"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <IngredientInfoSheet ingredient={info} onClose={() => setInfo(null)} />
    </section>
  );
}
