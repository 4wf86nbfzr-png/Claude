"use client";

import { Hand } from "lucide-react";
import { IngredientSelector } from "./IngredientSelector";
import { getGroup } from "@/lib/catalog";
import type { Category, Product, Selections } from "@/types/domain";

/**
 * Die Konfigurationsspalte: alle Schritte untereinander statt Assistent.
 * Wer nur die Sosse tauschen will, springt ueber die Leiste direkt hin.
 */
export function CustomizationPanel({
  category,
  product,
  selections,
  presets,
  accent,
  note,
  onToggle,
  onPreset,
  onNote,
}: {
  category: Category;
  product: Product;
  selections: Selections;
  presets: Product[];
  accent: string;
  note: string;
  onToggle: (groupId: string, id: string) => void;
  onPreset: (product: Product) => void;
  onNote: (value: string) => void;
}) {
  return (
    <div className="space-y-12">
      {presets.length > 1 && (
        <section aria-labelledby="presets">
          <h3 id="presets" className="kicker mb-3">
            Vorlage
          </h3>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {presets.map((p) => {
              const active = p.id === product.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPreset(p)}
                  aria-pressed={active}
                  className={`shrink-0 rounded-full border px-4 py-2 text-[0.8125rem] font-medium transition-colors ${
                    active
                      ? "border-transparent bg-white/[0.08] text-paper"
                      : "border-line text-muted hover:border-line-strong hover:text-paper"
                  }`}
                  style={active ? { boxShadow: `inset 0 0 0 1.5px ${accent}` } : undefined}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            Vorlage waehlen und danach frei aendern — nichts ist festgeschrieben.
          </p>
        </section>
      )}

      <p className="flex items-center gap-2 rounded-full border border-line bg-ink-2 px-4 py-2.5 text-[0.8125rem] text-muted">
        <Hand className="size-4 shrink-0 text-chrome" aria-hidden />
        Zutat antippen — oder mit dem Finger aufs Produkt ziehen.
      </p>

      {category.builder.steps.map((step) => (
        <section key={step.id} id={step.id} className="scroll-mt-40 space-y-8 lg:scroll-mt-32">
          <header>
            <p className="kicker">{step.kicker ?? step.label}</p>
            <h2 className="display display-m mt-1">{step.label}</h2>
          </header>

          {step.groupIds.map((groupId) => {
            const group = getGroup(category, groupId);
            if (!group) return null;
            return (
              <IngredientSelector
                key={group.id}
                group={group}
                selected={selections[group.id] ?? []}
                accent={accent}
                onToggle={(id) => onToggle(group.id, id)}
              />
            );
          })}
        </section>
      ))}

      <section aria-labelledby="note">
        <h3 id="note" className="kicker mb-3">
          Anmerkung
        </h3>
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value.slice(0, 180))}
          rows={3}
          placeholder="Zum Beispiel: Sosse bitte separat."
          className="w-full resize-none rounded-2xl border border-line bg-ink-2 p-4 text-sm placeholder:text-muted focus:border-line-strong focus:outline-none"
        />
        <p className="mt-1.5 text-right text-[0.6875rem] text-muted">{note.length}/180</p>
      </section>
    </div>
  );
}
