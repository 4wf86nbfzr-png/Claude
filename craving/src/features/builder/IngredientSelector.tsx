"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { ChoiceCard } from "./ChoiceCard";
import { IngredientInfoSheet } from "./NutritionInfo";
import { groupMembers } from "@/lib/catalog";
import type { ChoiceGroup, Ingredient } from "@/types/domain";

/**
 * Eine Auswahlgruppe. Regeln (min/max, einfach/mehrfach) kommen aus den
 * Daten, nicht aus dem UI — dieselbe Komponente traegt Groesse, Sosse und
 * Belag.
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
  const members = groupMembers(group);
  const atMax = group.max !== undefined && selected.length >= group.max;
  const belowMin = group.min !== undefined && selected.length < group.min;

  return (
    <section aria-labelledby={`group-${group.id}`} className="scroll-mt-28">
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

      {belowMin && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-saffron" role="status">
          <AlertCircle className="size-3.5" aria-hidden />
          {group.min === 1 ? "Bitte etwas auswaehlen." : `Mindestens ${group.min} auswaehlen.`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
        {members.map((choice) => {
          const isSelected = selected.includes(choice.id);
          return (
            <ChoiceCard
              key={choice.id}
              choice={choice}
              selected={isSelected}
              disabled={!isSelected && atMax && group.selection === "multiple"}
              accent={accent}
              onToggle={() => {
                if (!isSelected && atMax && group.selection === "multiple") return;
                onToggle(choice.id);
              }}
              onInfo={choice.ingredient ? () => setInfo(choice.ingredient ?? null) : undefined}
            />
          );
        })}
      </div>

      <IngredientInfoSheet ingredient={info} onClose={() => setInfo(null)} />
    </section>
  );
}
