"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Check, Info } from "lucide-react";
import clsx from "clsx";
import { textureUrl } from "@/data/assets";
import { formatSurcharge } from "@/lib/format";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";
import type { Ingredient } from "@/types/domain";
import { Piece, PieceDefs } from "./renderers/pieces";

/** Weg, den der Chip nach oben braucht, damit die Zutat aufgelegt wird. */
const PULL = 56;

/**
 * Eine Zutat als Bild.
 *
 * Bildquelle in dieser Reihenfolge:
 *   1. Foto-Freisteller der Zutat
 *   2. Fotoflaeche (Kaese, Teig, Fleisch) als runder Ausschnitt
 *   3. die gezeichnete Form — fuer Zutaten, zu denen noch kein Foto vorliegt
 *
 * Bedienung: antippen legt die Zutat auf. Wer lieber wischt, zieht den Chip
 * nach oben aufs Produkt. Waagerecht bleibt dem Browser ueberlassen — damit
 * scrollt die Leiste weiter wie gewohnt (`touch-action: pan-x`).
 */
export function IngredientChip({
  ingredient,
  selected,
  disabled,
  accent,
  onToggle,
  onInfo,
}: {
  ingredient: Ingredient;
  selected: boolean;
  /** Gesperrt, weil das Maximum der Gruppe erreicht ist. */
  disabled?: boolean;
  accent: string;
  onToggle: () => void;
  onInfo?: () => void;
}) {
  const reduced = useReducedMotionSafe();
  const soldOut = !ingredient.available;
  const blocked = soldOut || disabled;
  const sprite = ingredient.visual.sprites?.[0];
  const field = textureUrl(ingredient.visual.texture);
  const tint = ingredient.visual.tint;

  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const draggedAt = useRef(0);
  // Der Zustand treibt nur die Darstellung; entschieden wird auf dem Ref.
  // Beim Loslassen ist der letzte Zustandswert sonst noch nicht angekommen.
  const pullRef = useRef(0);
  const [pull, setPull] = useState(0);

  const endGesture = (commit: boolean) => {
    if (commit && pullRef.current <= -PULL && !blocked) {
      // Der Browser schickt nach dem Ziehen noch einen Klick hinterher —
      // ohne diese Marke wuerde die Zutat sofort wieder abgewaehlt.
      draggedAt.current = Date.now();
      onToggle();
    }
    if (axis.current === "x") draggedAt.current = Date.now();
    start.current = null;
    axis.current = null;
    pullRef.current = 0;
    setPull(0);
  };

  const armed = pull <= -PULL;

  return (
    <div className="relative w-[5.5rem] shrink-0 sm:w-24">
      <motion.div
        role="button"
        tabIndex={soldOut ? -1 : 0}
        aria-pressed={selected}
        aria-disabled={soldOut}
        aria-label={`${ingredient.name}${ingredient.price > 0 ? `, ${formatSurcharge(ingredient.price)}` : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!blocked) onToggle();
          }
        }}
        onClick={() => {
          if (blocked) return;
          if (Date.now() - draggedAt.current < 250) return;
          onToggle();
        }}
        onPointerDown={(e) => {
          if (blocked || reduced) return;
          start.current = { x: e.clientX, y: e.clientY };
          axis.current = null;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const from = start.current;
          if (!from) return;
          const dx = e.clientX - from.x;
          const dy = e.clientY - from.y;

          // Richtung einmal festlegen: quer = Leiste blaettern,
          // hoch = Zutat aufs Produkt ziehen.
          if (!axis.current && Math.hypot(dx, dy) > 6) {
            axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          }
          // Quer bleibt beim Browser: die Leiste scrollt nativ weiter,
          // das ist auf dem Telefon spuerbar fluessiger als jede
          // Nachbildung — und faellt nie aus.
          if (axis.current === "x") return;
          if (axis.current === "y") {
            const next = Math.max(-96, Math.min(0, dy));
            pullRef.current = next;
            setPull(next);
          }
        }}
        onPointerUp={() => endGesture(true)}
        onPointerCancel={() => endGesture(false)}
        animate={{ y: pull, scale: armed ? 1.08 : 1 }}
        transition={pull === 0 ? { type: "spring", stiffness: 420, damping: 30 } : { duration: 0 }}
        className={clsx(
          // pan-x: quer scrollt der Browser die Leiste, hoch zieht der
          // Nutzer die Zutat aufs Produkt.
          "group relative block w-full touch-pan-x select-none",
          soldOut ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <span
          className={clsx(
            "relative block aspect-square w-full overflow-hidden rounded-full border transition-all duration-200",
            selected ? "border-transparent" : "border-line group-hover:border-line-strong",
            soldOut && "opacity-40 grayscale",
            disabled && !selected && "opacity-45",
          )}
          style={{
            boxShadow: armed
              ? `0 0 0 3px ${accent}, 0 16px 30px -14px ${accent}`
              : selected
                ? `0 0 0 2px ${accent}, 0 10px 26px -12px ${accent}`
                : undefined,
            background:
              "radial-gradient(circle at 34% 28%, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 55%, rgba(0,0,0,0.35))",
          }}
        >
          {sprite ? (
            <Image
              src={sprite}
              alt=""
              width={96}
              height={96}
              sizes="96px"
              draggable={false}
              className="size-full scale-[0.94] object-contain p-1"
              style={tint ? { filter: tint } : undefined}
            />
          ) : field ? (
            <Image
              src={field}
              alt=""
              width={96}
              height={96}
              sizes="96px"
              draggable={false}
              className="size-full object-cover"
              style={tint ? { filter: tint } : undefined}
            />
          ) : (
            <svg viewBox="-1.4 -1.4 2.8 2.8" className="size-full p-1.5" aria-hidden>
              <defs>
                <PieceDefs id={`chip-${ingredient.id}`} palette={ingredient.visual.palette} />
              </defs>
              <Piece
                shape={ingredient.visual.shape}
                id={`chip-${ingredient.id}`}
                palette={ingredient.visual.palette}
              />
            </svg>
          )}

          <motion.span
            initial={false}
            animate={selected ? { scale: 1, opacity: 1 } : { scale: 0.3, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 24 }}
            className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full"
            style={{ background: accent }}
            aria-hidden
          >
            <Check className="size-3 text-black" strokeWidth={3} />
          </motion.span>
        </span>

        <span className="mt-2 block truncate text-center text-[0.75rem] font-medium leading-tight">
          {ingredient.name}
        </span>
        <span className="num mt-0.5 block text-center text-[0.6875rem] text-muted">
          {soldOut ? "aus" : ingredient.price > 0 ? formatSurcharge(ingredient.price) : "inkl."}
        </span>
      </motion.div>

      {onInfo && (
        <button
          type="button"
          onClick={onInfo}
          className="absolute -top-1 right-0 grid size-6 place-items-center rounded-full border border-line bg-ink-2 text-muted transition hover:text-paper"
          aria-label={`Allergene und Naehrwerte zu ${ingredient.name}`}
        >
          <Info className="size-3" aria-hidden />
        </button>
      )}
    </div>
  );
}
