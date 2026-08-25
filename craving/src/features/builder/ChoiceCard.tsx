"use client";

import { motion } from "framer-motion";
import { Check, Flame, Info, Leaf } from "lucide-react";
import clsx from "clsx";
import { formatSurcharge } from "@/lib/format";
import type { ChoiceView } from "@/lib/catalog";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";

/**
 * Eine Auswahl. Bewusst kein Kontrollkaestchen: die Karte selbst ist der
 * Schalter, der Haken bestaetigt nur. Nicht verfuegbare Zutaten bleiben
 * sichtbar (der Nutzer soll wissen, dass es sie gibt), sind aber gesperrt.
 */
export function ChoiceCard({
  choice,
  selected,
  disabled,
  accent,
  onToggle,
  onInfo,
}: {
  choice: ChoiceView;
  selected: boolean;
  /** Gesperrt, weil das Maximum der Gruppe erreicht ist. */
  disabled?: boolean;
  accent: string;
  onToggle: () => void;
  onInfo?: () => void;
}) {
  const reduced = useReducedMotionSafe();
  const soldOut = !choice.available;
  const blocked = soldOut || disabled;
  const tags = choice.ingredient?.tags ?? [];

  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={onToggle}
        disabled={soldOut}
        aria-pressed={selected}
        whileTap={reduced || blocked ? undefined : { scale: 0.96 }}
        className={clsx(
          "group relative flex w-full flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-colors duration-200",
          "min-h-[5.25rem] sm:min-h-[5.5rem]",
          selected
            ? "border-transparent bg-white/[0.07]"
            : "border-line bg-ink-2 hover:border-line-strong hover:bg-ink-3",
          soldOut && "cursor-not-allowed opacity-45",
          disabled && !selected && "opacity-50",
        )}
        style={selected ? { boxShadow: `inset 0 0 0 1.5px ${accent}` } : undefined}
      >
        <span className="flex w-full items-start justify-between gap-2">
          <span className="text-[0.9375rem] font-semibold leading-tight">{choice.name}</span>
          <motion.span
            initial={false}
            animate={selected ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 24 }}
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full"
            style={{ background: accent }}
            aria-hidden
          >
            <Check className="size-3 text-black" strokeWidth={3} />
          </motion.span>
        </span>

        {choice.description && (
          <span className="line-clamp-2 text-[0.75rem] leading-snug text-muted">{choice.description}</span>
        )}

        <span className="mt-auto flex w-full items-center gap-2 pt-1">
          {choice.price > 0 ? (
            <span className="num text-xs font-semibold text-chrome">{formatSurcharge(choice.price)}</span>
          ) : (
            <span className="text-xs text-muted">inklusive</span>
          )}
          {tags.includes("scharf") && <Flame className="size-3.5 text-ember" aria-label="scharf" />}
          {(tags.includes("vegan") || tags.includes("vegetarisch")) && (
            <Leaf className="size-3.5 text-basil" aria-label={tags.includes("vegan") ? "vegan" : "vegetarisch"} />
          )}
          {soldOut && (
            <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[0.625rem] font-medium text-muted">
              {choice.unavailableReason ?? "Nicht verfuegbar"}
            </span>
          )}
        </span>
      </motion.button>

      {onInfo && choice.ingredient && (
        <button
          type="button"
          onClick={onInfo}
          className="absolute bottom-2.5 right-2.5 grid size-7 place-items-center rounded-full text-muted transition hover:bg-white/8 hover:text-paper"
          aria-label={`Allergene und Naehrwerte zu ${choice.name}`}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
