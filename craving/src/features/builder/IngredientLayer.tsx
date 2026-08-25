"use client";

import { motion } from "framer-motion";
import type { Ingredient } from "@/types/domain";
import { Piece, PieceDefs, PIECE_SIZE } from "./renderers/pieces";
import type { Placement } from "./renderers/geometry";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";

/**
 * Eine Zutatenebene.
 *
 * Zutaten "erscheinen" nicht, sie kommen an: Scheiben fallen von oben,
 * Salat streut, Streifen schieben sich seitlich hinein, Sosse wird gezogen.
 * Beim Abwaehlen laeuft dieselbe Bewegung rueckwaerts (AnimatePresence im
 * Renderer). Bei prefers-reduced-motion bleibt nur ein Ein-/Ausblenden.
 */

interface EntryMotion {
  from: { x?: number; y?: number; scale?: number; rotate?: number; opacity: number };
  delayStep: number;
  duration: number;
}

const ENTRY: Record<string, EntryMotion> = {
  slice: { from: { y: -3.2, scale: 0.7, rotate: -40, opacity: 0 }, delayStep: 0.045, duration: 0.5 },
  ring: { from: { y: -3.6, scale: 0.6, rotate: 60, opacity: 0 }, delayStep: 0.035, duration: 0.45 },
  shred: { from: { y: -2.6, scale: 0.5, rotate: -70, opacity: 0 }, delayStep: 0.022, duration: 0.42 },
  dice: { from: { y: -4, scale: 0.4, opacity: 0 }, delayStep: 0.014, duration: 0.36 },
  leaf: { from: { y: -3, x: 0.8, scale: 0.6, rotate: -30, opacity: 0 }, delayStep: 0.05, duration: 0.62 },
  strip: { from: { x: -2.2, scale: 0.8, rotate: -12, opacity: 0 }, delayStep: 0.05, duration: 0.5 },
};

export function PieceLayer({
  ingredient,
  placements,
  sizeUnit = 1,
}: {
  ingredient: Ingredient;
  placements: Placement[];
  /** Umrechnung der normierten Stueckgroesse in die ViewBox des Renderers. */
  sizeUnit?: number;
}) {
  const reduced = useReducedMotionSafe();
  const { shape, palette, scale = 1 } = ingredient.visual;
  const entry = ENTRY[shape] ?? ENTRY.slice!;
  const size = PIECE_SIZE[shape] * scale * sizeUnit;

  return (
    <g>
      <defs>
        <PieceDefs id={ingredient.id} palette={palette} />
      </defs>
      {placements.map((p, index) => (
        <g key={index} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${(size * p.scale).toFixed(3)})`}>
          <motion.g
            initial={reduced ? { opacity: 0 } : { ...entry.from }}
            animate={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { ...entry.from, transition: { duration: 0.22, delay: p.order * 0.08 } }}
            transition={
              reduced
                ? { duration: 0.18 }
                : {
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                    mass: 0.6,
                    delay: p.order * entry.delayStep * placements.length * 0.35,
                  }
            }
            style={{ originX: 0, originY: 0 }}
          >
            <g
              transform={`rotate(${p.rot.toFixed(1)})`}
              style={{ filter: `brightness(${(1 + p.shade * 0.5).toFixed(3)})` }}
            >
              <Piece shape={shape} id={ingredient.id} palette={palette} />
            </g>
          </motion.g>
        </g>
      ))}
    </g>
  );
}

/**
 * Flaechige Ebene (Sosse, Kaesedecke). Wird von der Mitte nach aussen
 * "aufgezogen" — eine wachsende Maske statt eines simplen Fade.
 */
export function SpreadLayer({
  ingredient,
  path,
  radius,
  texture,
}: {
  ingredient: Ingredient;
  path: string;
  /** Radius der Aufziehmaske. */
  radius: number;
  texture?: React.ReactNode;
}) {
  const reduced = useReducedMotionSafe();
  const maskId = `mask-${ingredient.id}`;
  const [base = "#ccc", dark = "#999", light = "#fff"] = ingredient.visual.palette;

  return (
    <g>
      <defs>
        <radialGradient id={`sg-${ingredient.id}`} cx="38%" cy="32%" r="76%">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={base} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
        <mask id={maskId}>
          <motion.circle
            cx="0"
            cy="0"
            fill="#fff"
            initial={{ r: reduced ? radius : 0 }}
            animate={{ r: radius }}
            exit={{ r: 0 }}
            transition={reduced ? { duration: 0.2 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <path d={path} fill={`url(#sg-${ingredient.id})`} />
        {texture}
      </g>
    </g>
  );
}

/** Sosse in Baendern, wie aus der Flasche gezogen. */
export function DrizzleLayer({
  ingredient,
  path,
  width,
  length,
}: {
  ingredient: Ingredient;
  path: string;
  width: number;
  /** Ungefaehre Pfadlaenge fuer die Zeichen-Animation. */
  length: number;
}) {
  const reduced = useReducedMotionSafe();
  const [base = "#fff", dark = "#ccc", light = "#fff", speck] = ingredient.visual.palette;

  return (
    <g>
      <defs>
        <linearGradient id={`dz-${ingredient.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={base} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>
      <motion.path
        d={path}
        fill="none"
        stroke={`url(#dz-${ingredient.id})`}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? { opacity: 0 } : { pathLength: 0, opacity: 1 }}
        animate={reduced ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { pathLength: 0, opacity: 1 }}
        transition={{ duration: reduced ? 0.2 : 0.5, ease: "easeInOut" }}
        style={{ strokeDasharray: length }}
      />
      {speck && (
        <motion.path
          d={path}
          fill="none"
          stroke={speck}
          strokeWidth={width * 0.28}
          strokeLinecap="round"
          strokeDasharray="0.5 6"
          initial={reduced ? { opacity: 0 } : { pathLength: 0, opacity: 0.85 }}
          animate={{ pathLength: 1, opacity: 0.85 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.2 : 0.55, ease: "easeInOut" }}
        />
      )}
    </g>
  );
}
