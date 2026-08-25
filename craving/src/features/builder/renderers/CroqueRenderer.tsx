"use client";

import { AnimatePresence, motion } from "framer-motion";
import { PieceLayer, SpreadLayer } from "../IngredientLayer";
import { bandPlacements, slabPath } from "./geometry";
import { hasPieceRenderer } from "./pieces";
import { between, randomFor, round } from "@/lib/rng";
import type { Ingredient } from "@/types/domain";
import { GrainOverlay, TextureDefs } from "./texture";
import type { RendererProps } from "./types";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";

/**
 * Croque von der Seite: gepresste Scheiben, Fuellung dazwischen.
 * Die obere Scheibe legt sich beim Hinzufuegen einer Zutat sichtbar
 * hoeher — die Feder-Animation ist der "Pressen"-Moment.
 */

const SLICE_W = 268;
const SLICE_H = 46;
const BOTTOM_Y = 54;
const MIN_GAP = 24;
/** Zutatenstuecke sind hier kleiner als auf der Pizza. */
const SIZE_UNIT = 0.72;

function pieceCount(shape: string, density: number): number {
  const base: Record<string, number> = {
    slice: 6, ring: 8, dice: 22, strip: 7, shred: 16, leaf: 8,
  };
  return Math.max(3, Math.round((base[shape] ?? 8) * density));
}

function Toast({ y, rotate = 0, id }: { y: number; rotate?: number; id: string }) {
  const rnd = randomFor(`croque-toast-${id}`);
  return (
    <g transform={`translate(0 ${y}) rotate(${rotate})`}>
      <g filter="url(#cq-edge)">
        <rect x={-SLICE_W / 2} y={0} width={SLICE_W} height={SLICE_H} rx={15} fill="url(#cq-toast)" />
      </g>
      <rect x={-SLICE_W / 2} y={0} width={SLICE_W} height={SLICE_H} rx={15} fill="none" stroke="#96631F" strokeWidth="3" opacity="0.55" />
      <rect x={-SLICE_W / 2 + 7} y={5} width={SLICE_W - 14} height={SLICE_H - 11} rx={11} fill="none" stroke="#F7E2B0" strokeWidth="2" opacity="0.28" />
      {/* Grillstreifen */}
      <g opacity="0.26">
        {Array.from({ length: 5 }).map((_, i) => {
          const x = round(-SLICE_W / 2 + 34 + i * 48 + between(rnd, -6, 6));
          return (
            <path
              key={i}
              d={`M ${x} 6 L ${x + 16} ${SLICE_H - 6}`}
              stroke="#7A4E17"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
          );
        })}
      </g>
      <clipPath id={`cq-clip-${id}`}>
        <rect x={-SLICE_W / 2} y={0} width={SLICE_W} height={SLICE_H} rx={15} />
      </clipPath>
      <g clipPath={`url(#cq-clip-${id})`}>
        <GrainOverlay prefix="cq" box={{ x: -SLICE_W / 2, y: 0, width: SLICE_W, height: SLICE_H }} opacity={0.24} />
        <GrainOverlay prefix="cq" box={{ x: -SLICE_W / 2, y: 0, width: SLICE_W, height: SLICE_H }} opacity={0.16} variant="clouds" />
      </g>
      <rect x={-SLICE_W / 2 + 8} y={4} width={SLICE_W - 16} height={6} rx={3} fill="#FBE7BE" opacity="0.28" />
    </g>
  );
}

export function CroqueRenderer({ ingredients, effects, label }: RendererProps) {
  const reduced = useReducedMotionSafe();
  const double = effects.variants.includes("double");
  const vollkorn = effects.variants.includes("vollkorn");
  const sauerteig = effects.variants.includes("sauerteig");

  const layered = ingredients;
  const step = layered.length > 0 ? Math.min(15, 80 / layered.length) : 0;
  const fillHeight = Math.max(MIN_GAP, layered.length * step + 12);
  const topSliceY = BOTTOM_Y - fillHeight - SLICE_H;
  const hasCheese = ingredients.some((i) => i.visual.shape === "sheet");

  const bandFor = (index: number) => ({
    x: -SLICE_W / 2 + 30,
    y: BOTTOM_Y - 12 - index * step - 10,
    width: SLICE_W - 60,
    height: 15,
    arc: 5,
  });

  const renderLayer = (ing: Ingredient, index: number) => {
    const { shape, density = 1 } = ing.visual;
    const seed = `croque-${ing.id}`;
    const band = bandFor(index);

    if (shape === "sheet" || shape === "spread" || shape === "sauce") {
      // Flache Scheibe statt Klecks: im Querschnitt ist Kaese eine Lage,
      // keine Kugel.
      const cx = band.x + band.width / 2;
      const cy = band.y + band.height / 2;
      const w = band.width * (shape === "spread" ? 0.92 : 1);
      const h = shape === "sheet" ? 18 : 12;
      return (
        <motion.g key={ing.id} transform={`translate(${cx} ${cy})`}>
          <SpreadLayer ingredient={ing} path={slabPath(seed, w, h)} radius={w * 0.62} />
        </motion.g>
      );
    }

    if (!hasPieceRenderer(shape)) return null;

    return (
      <motion.g key={ing.id}>
        <PieceLayer
          ingredient={ing}
          sizeUnit={SIZE_UNIT}
          placements={bandPlacements(seed, pieceCount(shape, density), band)}
        />
      </motion.g>
    );
  };

  return (
    <svg viewBox="-200 -160 400 320" className="h-full w-full overflow-visible" role="img" aria-label={label}>
      <defs>
        <TextureDefs prefix="cq" />
        <filter id="cq-edge" x="-10%" y="-25%" width="120%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="21" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <linearGradient id="cq-toast" x1="10%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%" stopColor={vollkorn ? "#C79B5E" : sauerteig ? "#EBCB92" : "#F3D9A4"} />
          <stop offset="50%" stopColor={vollkorn ? "#A9793F" : "#DFB670"} />
          <stop offset="100%" stopColor={vollkorn ? "#8A5F2C" : "#BE8B42"} />
        </linearGradient>
        <radialGradient id="cq-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.7)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <linearGradient id="cq-inner" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4A3320" />
          <stop offset="100%" stopColor="#2A1B0E" />
        </linearGradient>
        <linearGradient id="cq-drip" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFE29A" />
          <stop offset="100%" stopColor="#E0A82F" />
        </linearGradient>
        <clipPath id="cq-fill-clip">
          <rect x={-SLICE_W / 2 + 6} y={-150} width={SLICE_W - 12} height={210} rx={10} />
        </clipPath>
      </defs>

      <ellipse cx="0" cy={BOTTOM_Y + SLICE_H + 16} rx="150" ry="20" fill="url(#cq-shadow)" />

      <Toast y={BOTTOM_Y} id="bottom" />

      {/* Fuellraum: dunkle Masse hinter den Lagen. Ohne sie scheint der
          Hintergrund zwischen den Schichten durch und alles schwebt. */}
      <motion.rect
        x={-SLICE_W / 2 + 12}
        width={SLICE_W - 24}
        rx={9}
        fill="url(#cq-inner)"
        initial={false}
        animate={{ y: topSliceY + SLICE_H - 6, height: Math.max(10, BOTTOM_Y - topSliceY - SLICE_H + 12) }}
        transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 200, damping: 22 }}
      />

      <g clipPath="url(#cq-fill-clip)">
        <AnimatePresence>{layered.map(renderLayer)}</AnimatePresence>
      </g>

      {double && (
        <motion.g
          animate={{ y: topSliceY + SLICE_H * 0.55 }}
          initial={false}
          transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 210, damping: 24 }}
        >
          <Toast y={0} rotate={-0.6} id="middle" />
        </motion.g>
      )}

      {/* Kaesefaden — nur wenn Kaese gewaehlt ist */}
      <AnimatePresence>
        {hasCheese && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.path
              animate={{ d: `M ${SLICE_W / 2 - 26} ${topSliceY + SLICE_H} C ${SLICE_W / 2 - 6} ${topSliceY + SLICE_H + 26}, ${SLICE_W / 2 + 2} ${BOTTOM_Y - 6}, ${SLICE_W / 2 - 22} ${BOTTOM_Y + 8}` }}
              initial={false}
              transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 190, damping: 26 }}
              stroke="url(#cq-drip)"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
          </motion.g>
        )}
      </AnimatePresence>

      <motion.g
        animate={{ y: topSliceY }}
        initial={false}
        transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 200, damping: 22 }}
      >
        <Toast y={0} rotate={0.8} id="top" />
      </motion.g>

      {effects.spice > 0 && (
        <g opacity={0.6}>
          {bandPlacements("cq-spice", effects.spice * 6, { x: -90, y: topSliceY - 10, width: 180, height: 14 }).map((p, i) => (
            <rect key={i} x={p.x} y={p.y} width="4" height="2" rx="1" fill="#C0392B" transform={`rotate(${p.rot} ${p.x} ${p.y})`} />
          ))}
        </g>
      )}
    </svg>
  );
}
