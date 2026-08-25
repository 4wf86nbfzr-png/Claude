"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PieceLayer, SpreadLayer } from "../IngredientLayer";
import { blobPath, discPlacements, shift } from "./geometry";
import { hasPieceRenderer } from "./pieces";
import { randomFor, between, round } from "@/lib/rng";
import { GrainOverlay, TextureDefs } from "./texture";
import type { RendererProps } from "./types";

const R_CRUST = 172;
const R_DOUGH = 150;
const R_SAUCE = 141;
const R_CHEESE = 136;
const R_TOPPING = 126;

/** Wie viele Stuecke eine Zutat bekommt — Dichte x Flaeche. */
function pieceCount(shape: string, density: number): number {
  const base: Record<string, number> = {
    slice: 11, ring: 13, dice: 34, leaf: 11, strip: 8, shred: 16,
  };
  return Math.max(3, Math.round((base[shape] ?? 9) * density));
}

/**
 * Schmelzflecken: grosse, weiche Farbfelder in leicht verschiedenen
 * Warmtoenen. Erst dadurch sieht der Kaese gebacken aus statt gefaerbt.
 */
function MeltPatches({ seed, radius }: { seed: string; radius: number }) {
  const rnd = randomFor(seed);
  const tones = ["#F6D98A", "#D9A63C", "#C98A22", "#FFEBB4", "#B87A18"];
  return (
    <g filter="url(#pz-soft)">
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = rnd() * Math.PI * 2;
        const r = radius * 0.72 * Math.sqrt(rnd());
        const rx = round(between(rnd, radius * 0.16, radius * 0.4));
        return (
          <ellipse
            key={i}
            cx={round(Math.cos(angle) * r)}
            cy={round(Math.sin(angle) * r)}
            rx={rx}
            ry={round(rx * between(rnd, 0.6, 1))}
            fill={tones[i % tones.length]}
            opacity={round(between(rnd, 0.16, 0.34), 2)}
          />
        );
      })}
    </g>
  );
}

/** Backspuren: dunklere Flecken auf Teig und Kaese, immer gleich verteilt. */
function BakeSpots({ seed, radius, color, count, opacity }: {
  seed: string; radius: number; color: string; count: number; opacity: number;
}) {
  const rnd = randomFor(seed);
  return (
    <g opacity={opacity}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = rnd() * Math.PI * 2;
        const r = radius * Math.sqrt(rnd());
        const rx = round(between(rnd, 3, 11));
        const cx = round(Math.cos(angle) * r);
        const cy = round(Math.sin(angle) * r);
        return (
          <ellipse
            key={i}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={round(rx * between(rnd, 0.5, 0.9))}
            fill={color}
            transform={`rotate(${round(between(rnd, 0, 180), 1)} ${cx} ${cy})`}
          />
        );
      })}
    </g>
  );
}

export function PizzaRenderer({ ingredients, effects, label }: RendererProps) {
  const reduced = useReducedMotion();
  const thin = effects.variants.includes("thin");
  const stuffed = effects.variants.includes("stuffed");
  const crust = thin ? R_CRUST - 8 : R_CRUST;
  const dough = thin ? R_DOUGH + 6 : R_DOUGH;

  return (
    <svg
      viewBox="-200 -200 400 400"
      className="h-full w-full overflow-visible"
      role="img"
      aria-label={label}
    >
      <defs>
        <TextureDefs prefix="pz" />
        <filter id="pz-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="pz-rough" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="11" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <radialGradient id="pz-crust" cx="42%" cy="36%" r="74%">
          <stop offset="0%" stopColor="#E7BE76" />
          <stop offset="62%" stopColor="#D9A85E" />
          <stop offset="86%" stopColor="#BB8237" />
          <stop offset="100%" stopColor="#8F5F24" />
        </radialGradient>
        <radialGradient id="pz-dough" cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#E2B978" />
          <stop offset="70%" stopColor="#D3A75F" />
          <stop offset="100%" stopColor="#BC8C45" />
        </radialGradient>
        <radialGradient id="pz-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.75)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <clipPath id="pz-clip">
          <circle r={R_TOPPING + 6} />
        </clipPath>
        <clipPath id="pz-crust-clip">
          <circle r={crust - 2} />
        </clipPath>
      </defs>

      {/* Schatten auf der Unterlage */}
      <ellipse cx="6" cy={crust * 0.82} rx={crust * 0.98} ry={crust * 0.3} fill="url(#pz-shadow)" opacity="0.85" />

      {/* Teig */}
      <g filter={reduced ? undefined : "url(#pz-rough)"}>
        <circle r={crust} fill="url(#pz-crust)" />
        <circle r={dough} fill="url(#pz-dough)" />
      </g>
      <g clipPath="url(#pz-crust-clip)">
        <BakeSpots seed="pz-crust-spots" radius={crust - 4} color="#7A4A18" count={40} opacity={0.34} />
        <BakeSpots seed="pz-crust-blister" radius={crust - 10} color="#F2DAA8" count={16} opacity={0.2} />
        <GrainOverlay prefix="pz" box={{ x: -crust, y: -crust, width: crust * 2, height: crust * 2 }} opacity={0.2} />
        <GrainOverlay prefix="pz" box={{ x: -crust, y: -crust, width: crust * 2, height: crust * 2 }} opacity={0.13} variant="clouds" />
      </g>
      {/* Kante des Randes: der Teig faellt nach aussen ab */}
      <circle r={crust - 1} fill="none" stroke="#6E4514" strokeWidth="3" opacity="0.35" />
      <circle r={dough} fill="none" stroke="#A97634" strokeWidth="4" opacity="0.4" />
      {stuffed && (
        <circle
          r={crust - 12}
          fill="none"
          stroke="#F6DCA8"
          strokeWidth="10"
          opacity="0.55"
          strokeDasharray="26 14"
        />
      )}

      <AnimatePresence>
        {ingredients.map((ing) => {
          const { shape, density = 1 } = ing.visual;
          const seed = `pizza-${ing.id}`;

          if (shape === "spread" || shape === "sauce") {
            return (
              <motion.g key={ing.id}>
                <SpreadLayer
                  ingredient={ing}
                  path={blobPath(seed, R_SAUCE, 0.022, 28)}
                  radius={R_SAUCE + 10}
                  texture={
                    <>
                      <BakeSpots seed={`${seed}-t`} radius={R_SAUCE - 12} color={shift(ing.visual.palette[1] ?? "#000", -0.3)} count={22} opacity={0.4} />
                      <GrainOverlay prefix="pz" box={{ x: -R_SAUCE, y: -R_SAUCE, width: R_SAUCE * 2, height: R_SAUCE * 2 }} opacity={0.24} />
                    </>
                  }
                />
              </motion.g>
            );
          }

          if (shape === "sheet") {
            return (
              <motion.g key={ing.id}>
                <SpreadLayer
                  ingredient={ing}
                  path={blobPath(`${seed}-cheese`, R_CHEESE, 0.028, 26)}
                  radius={R_CHEESE + 12}
                  texture={
                    <>
                      {/* Backfarbe: erst Schmelzflecken, dann Blasen und Braeune */}
                      <MeltPatches seed={`${seed}-melt`} radius={R_CHEESE} />
                      <GrainOverlay prefix="pz" box={{ x: -R_CHEESE, y: -R_CHEESE, width: R_CHEESE * 2, height: R_CHEESE * 2 }} opacity={0.5} variant="clouds" />
                      <BakeSpots seed={`${seed}-brown`} radius={R_CHEESE - 10} color="#98520E" count={40} opacity={0.5} />
                      <BakeSpots seed={`${seed}-dark`} radius={R_CHEESE - 18} color="#5E2E04" count={16} opacity={0.36} />
                      <BakeSpots seed={`${seed}-light`} radius={R_CHEESE - 24} color="#FCE3A4" count={16} opacity={0.24} />
                      {/* Fettglanz: zwei weiche Streifen, mehr braucht es nicht */}
                      <ellipse cx={-38} cy={-52} rx={54} ry={16} fill="#fff" opacity="0.07" transform="rotate(-24 -38 -52)" />
                      <ellipse cx={44} cy={38} rx={38} ry={11} fill="#fff" opacity="0.05" transform="rotate(-14 44 38)" />
                      <GrainOverlay prefix="pz" box={{ x: -R_CHEESE, y: -R_CHEESE, width: R_CHEESE * 2, height: R_CHEESE * 2 }} opacity={0.22} />
                    </>
                  }
                />
              </motion.g>
            );
          }

          if (!hasPieceRenderer(shape)) return null;

          return (
            <motion.g key={ing.id} clipPath="url(#pz-clip)">
              <PieceLayer
                ingredient={ing}
                placements={discPlacements(seed, pieceCount(shape, density), R_TOPPING)}
              />
            </motion.g>
          );
        })}
      </AnimatePresence>

      {/* Schaerfe: feine Chiliflocken ueber allem */}
      {effects.spice > 0 && (
        <g opacity={0.5 + effects.spice * 0.12}>
          {discPlacements("pz-spice", effects.spice * 12, R_TOPPING - 10).map((p, i) => (
            <rect
              key={i}
              x={p.x}
              y={p.y}
              width={3.4}
              height={1.8}
              rx={0.8}
              fill="#C0392B"
              transform={`rotate(${p.rot} ${p.x} ${p.y})`}
            />
          ))}
        </g>
      )}

      {/* Glanzlicht — nur eine Spur, sonst wirkt es nach Plastik */}
      <ellipse cx={-crust * 0.3} cy={-crust * 0.46} rx={crust * 0.5} ry={crust * 0.16}
        fill="#fff" opacity="0.045" transform="rotate(-18)" />
    </svg>
  );
}
