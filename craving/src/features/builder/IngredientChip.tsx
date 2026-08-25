"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Check, Info } from "lucide-react";
import clsx from "clsx";
import { textureUrl } from "@/data/assets";
import { formatSurcharge } from "@/lib/format";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";
import type { Ingredient } from "@/types/domain";
import { Piece, PieceDefs } from "./renderers/pieces";

/**
 * Eine Zutat als Bild.
 *
 * Reihenfolge der Quellen:
 *   1. Foto-Freisteller der Zutat
 *   2. Fotoflaeche (Kaese, Teig, Fleisch) als runder Ausschnitt
 *   3. die gezeichnete Form — fuer Zutaten, zu denen noch kein Foto vorliegt
 *
 * Der Chip laesst sich antippen ODER in Richtung Produkt ziehen. Das Ziehen
 * ist die Geste, die auf dem Telefon am schnellsten von der Hand geht: Zutat
 * greifen, aufs Essen werfen.
 */
export function IngredientChip({
  ingredient,
  selected,
  disabled,
  accent,
  onToggle,
  onInfo,
  dragDirection = "up",
}: {
  ingredient: Ingredient;
  selected: boolean;
  disabled?: boolean;
  accent: string;
  onToggle: () => void;
  onInfo?: () => void;
  /** Wohin muss gewischt werden, damit die Zutat aufs Produkt geht? */
  dragDirection?: "up" | "left";
}) {
  const reduced = useReducedMotionSafe();
  const soldOut = !ingredient.available;
  const blocked = soldOut || disabled;
  const sprite = ingredient.visual.sprites?.[0];
  const field = textureUrl(ingredient.visual.texture);
  const tint = ingredient.visual.tint;

  const handleDragEnd = (_: unknown, info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }) => {
    if (blocked) return;
    const passed =
      dragDirection === "up"
        ? info.offset.y < -56 || info.velocity.y < -420
        : info.offset.x < -56 || info.velocity.x < -420;
    if (passed) onToggle();
  };

  return (
    <div className="relative w-[5.5rem] shrink-0 sm:w-24">
      <motion.button
        type="button"
        onClick={() => !blocked && onToggle()}
        disabled={soldOut}
        aria-pressed={selected}
        aria-label={`${ingredient.name}${ingredient.price > 0 ? `, ${formatSurcharge(ingredient.price)}` : ""}`}
        drag={blocked || reduced ? false : true}
        dragSnapToOrigin
        dragElastic={0.5}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        whileTap={blocked || reduced ? undefined : { scale: 0.94 }}
        className={clsx(
          "group relative block w-full cursor-pointer touch-none",
          soldOut && "cursor-not-allowed",
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
            boxShadow: selected ? `0 0 0 2px ${accent}, 0 10px 26px -12px ${accent}` : undefined,
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
      </motion.button>

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
