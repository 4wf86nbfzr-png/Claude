"use client";

import { AnimatePresence, motion } from "framer-motion";
import { DrizzleLayer, PieceLayer, SpreadLayer, TexturePattern } from "../IngredientLayer";
import { bandPlacements, blobPath, drizzlePath } from "./geometry";
import { hasPieceRenderer } from "./pieces";
import { GrainOverlay, TextureDefs } from "./texture";
import { between, randomFor, round } from "@/lib/rng";
import type { Ingredient } from "@/types/domain";
import type { RendererProps } from "./types";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";

/**
 * Doener von vorn.
 *
 * Aufbau in Ebenen, von hinten nach vorn:
 *   1. Rueckwand des Fladenbrots (ragt hinter der Fuellung hoch)
 *   2. dunkler Innenraum — sorgt dafuer, dass Luecken nach "Brotinneres"
 *      aussehen statt nach Kruste
 *   3. Fuellung, geclippt auf den offenen Bereich; jede Zutat ein eigenes
 *      Band, untere Stapelebene (visual.z) = tiefer im Brot
 *   4. Sossen, quer darueber gezogen
 *   5. vordere Brotwand — erst dadurch liegt die Fuellung sichtbar "drin"
 */

/**
 * Sichtbarer Fuellbereich. Die oberste Lage endet bewusst AUF Hoehe des
 * Brotrands: liegt sie darueber, schwebt sie sichtbar in der Luft.
 */
const FILL_ANCHOR = 10;
const FILL_TOP = -54;
/** Zutatenstuecke sind hier kleiner als auf der Pizza. */
const SIZE_UNIT = 0.8;

function pieceCount(shape: string, density: number): number {
  const base: Record<string, number> = {
    shred: 34, slice: 11, ring: 13, dice: 38, strip: 15, leaf: 13,
  };
  return Math.max(5, Math.round((base[shape] ?? 12) * density));
}

function Sesame({ seed, count }: { seed: string; count: number }) {
  const rnd = randomFor(seed);
  return (
    <g opacity="0.5">
      {Array.from({ length: count }).map((_, i) => {
        const x = round(between(rnd, -128, 128));
        const y = round(between(rnd, 20, 86));
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx={3}
            ry={1.6}
            fill="#F8E9C6"
            transform={`rotate(${round(between(rnd, -50, 50), 1)} ${x} ${y})`}
          />
        );
      })}
    </g>
  );
}

function Defs() {
  return (
    <defs>
      <TextureDefs prefix="dn" />
      {/* Das Brot ist eine echte Fotoflaeche; Form und Licht kommen aus
          den Verlaeufen darueber. */}
      <TexturePattern id="dn-brot" texture="fladenbrot" tileSize={420} />
      <linearGradient id="dn-bread-shade" x1="25%" y1="0%" x2="70%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.10" />
        <stop offset="45%" stopColor="#000" stopOpacity="0.02" />
        <stop offset="100%" stopColor="#2A1B08" stopOpacity="0.34" />
      </linearGradient>
      <linearGradient id="dn-front-shade" x1="30%" y1="0%" x2="60%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.14" />
        <stop offset="40%" stopColor="#000" stopOpacity="0.06" />
        <stop offset="100%" stopColor="#1E1305" stopOpacity="0.44" />
      </linearGradient>
      <linearGradient id="dn-inner" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#5B3A1E" />
        <stop offset="100%" stopColor="#241407" />
      </linearGradient>
      <radialGradient id="dn-shadow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgba(0,0,0,0.7)" />
        <stop offset="100%" stopColor="rgba(0,0,0,0)" />
      </radialGradient>
      <filter id="dn-rough" x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="4" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <clipPath id="dn-fill-clip">
        <path d="M -136 -170 L 136 -170 L 136 2 C 100 38, -100 38, -136 2 Z" />
      </clipPath>
      <clipPath id="dn-bread-clip">
        <path d="M -152 -18 C -156 40, -112 96, 0 96 C 112 96, 156 40, 152 -18 C 152 -36, 96 -48, 0 -48 C -96 -48, -152 -36, -152 -18 Z" />
      </clipPath>
      <clipPath id="dn-wrap-clip">
        <path d="M -70 -132 L 70 -100 L 70 44 L -70 44 Z" />
      </clipPath>
    </defs>
  );
}

export function DonerRenderer({ ingredients, effects, label }: RendererProps) {
  const reduced = useReducedMotionSafe();
  const duerum = effects.variants.includes("duerum");
  const vollkorn = effects.variants.includes("vollkorn");

  const layered = ingredients.filter((i) => i.visual.shape !== "sauce");
  const sauces = ingredients.filter((i) => i.visual.shape === "sauce");
  const span = FILL_ANCHOR - FILL_TOP;
  const step = Math.min(12, span / Math.max(layered.length, 1));

  const bandFor = (index: number, height: number) => ({
    x: duerum ? -54 : -124,
    y: FILL_ANCHOR - index * step,
    width: duerum ? 108 : 248,
    height,
    arc: duerum ? 10 : 26,
  });

  const renderLayer = (ing: Ingredient, index: number) => {
    const { shape, density = 1 } = ing.visual;
    const seed = `doener-${ing.id}`;
    const band = bandFor(index, 20);

    if (shape === "sheet") {
      // Geschmolzener Kaese liegt als Fleck auf dem Fleisch, nicht als
      // Decke ueber der ganzen Breite — sonst wird er zur zweiten Brothaelfte.
      const cx = band.x + band.width / 2;
      const cy = band.y + band.height / 2;
      const sx = (band.width * 0.5) / 180;
      return (
        <motion.g key={ing.id} transform={`translate(${cx} ${cy}) scale(${sx.toFixed(3)} 0.17)`}>
          <SpreadLayer ingredient={ing} path={blobPath(seed, 90, 0.16, 14)} radius={104} />
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

  // Sosse liegt im oberen Drittel der Fuellung, nicht darueber — sonst
  // sieht es aus, als laege sie auf blankem Brot.
  const sauceTop = Math.max(1, layered.length * 0.72);

  return (
    <svg viewBox="-200 -180 400 360" className="h-full w-full overflow-visible" role="img" aria-label={label}>
      <Defs />

      <ellipse cx="0" cy="106" rx="150" ry="20" fill="url(#dn-shadow)" />

      {duerum ? (
        <>
          {/* Duerum: gerollt, oben schraeg angeschnitten */}
          <g filter={reduced ? undefined : "url(#dn-rough)"}>
            <path
              d="M -76 -104 L 76 -74 L 76 104 C 76 128, 38 140, 0 140 C -38 140, -76 128, -76 104 Z"
              fill="url(#dn-brot)"
              style={{ filter: vollkorn ? "saturate(0.9) brightness(0.72)" : "saturate(0.62) brightness(1.02)" }}
            />
          </g>
          <path d="M -76 -104 L 76 -74 L 58 -58 L -60 -86 Z" fill="url(#dn-inner)" opacity="0.9" />
          <g clipPath="url(#dn-wrap-clip)">
            <AnimatePresence>{layered.map(renderLayer)}</AnimatePresence>
          </g>
          {/* Einschlagpapier */}
          <path
            d="M -80 46 L 80 46 L 80 112 C 80 136, 38 148, 0 148 C -38 148, -80 136, -80 112 Z"
            fill="#EDEAE3"
            opacity="0.94"
          />
          <path d="M -80 46 L 80 46 L 80 55 L -80 55 Z" fill="#CFCAC0" opacity="0.9" />
          <path d="M -46 60 L -30 140" stroke="#D6D2C8" strokeWidth="3" fill="none" opacity="0.8" />
          <path d="M 40 58 L 26 140" stroke="#D6D2C8" strokeWidth="3" fill="none" opacity="0.8" />
        </>
      ) : (
        <>
          {/* 1. Rueckwand */}
          <g filter={reduced ? undefined : "url(#dn-rough)"}>
            <path
              d="M -152 -18 C -156 40, -112 96, 0 96 C 112 96, 156 40, 152 -18 C 152 -36, 96 -48, 0 -48 C -96 -48, -152 -36, -152 -18 Z"
              fill="url(#dn-brot)"
              style={{ filter: vollkorn ? "saturate(0.9) brightness(0.72)" : "saturate(0.62) brightness(1.02)" }}
            />
            <path
              d="M -152 -18 C -156 40, -112 96, 0 96 C 112 96, 156 40, 152 -18 C 152 -36, 96 -48, 0 -48 C -96 -48, -152 -36, -152 -18 Z"
              fill="url(#dn-bread-shade)"
            />
          </g>
          <g clipPath="url(#dn-bread-clip)">
            <GrainOverlay prefix="dn" box={{ x: -160, y: -70, width: 320, height: 190 }} opacity={0.22} />
            <GrainOverlay prefix="dn" box={{ x: -160, y: -70, width: 320, height: 190 }} opacity={0.14} variant="clouds" />
          </g>

          {/* 2. Innenraum */}
          <path
            d="M -128 -34 C -68 -6, 68 -6, 128 -34 C 118 24, 60 46, 0 46 C -60 46, -118 24, -128 -34 Z"
            fill="url(#dn-inner)"
            opacity="0.9"
          />
          <path
            d="M -128 -34 C -68 -6, 68 -6, 128 -34"
            fill="none"
            stroke="#F4DDAA"
            strokeWidth="3"
            opacity="0.45"
            strokeLinecap="round"
          />

          {/* 3./4. Fuellung und Sossen */}
          <g clipPath="url(#dn-fill-clip)">
            <AnimatePresence>{layered.map(renderLayer)}</AnimatePresence>
            <AnimatePresence>
              {sauces.map((ing, i) => {
                const band = bandFor(sauceTop + i * 0.45, 14);
                return (
                  <motion.g key={ing.id}>
                    <DrizzleLayer
                      ingredient={ing}
                      path={drizzlePath(`doener-sauce-${ing.id}`, { ...band, height: 15 }, 7)}
                      width={5}
                      length={520}
                    />
                  </motion.g>
                );
              })}
            </AnimatePresence>
          </g>

          {/* 5. Vordere Brotwand */}
          <g filter={reduced ? undefined : "url(#dn-rough)"}>
            <path
              d="M -150 -14 C -148 48, -104 98, 0 98 C 104 98, 148 48, 150 -14 C 100 26, -100 26, -150 -14 Z"
              fill="url(#dn-brot)"
              style={{ filter: vollkorn ? "saturate(0.9) brightness(0.68)" : "saturate(0.58) brightness(0.96)" }}
            />
            <path
              d="M -150 -14 C -148 48, -104 98, 0 98 C 104 98, 148 48, 150 -14 C 100 26, -100 26, -150 -14 Z"
              fill="url(#dn-front-shade)"
            />
          </g>
          <path
            d="M -150 -14 C -100 26, 100 26, 150 -14"
            fill="none"
            stroke="#FBE8BC"
            strokeWidth="3"
            opacity="0.45"
            strokeLinecap="round"
          />
          <g clipPath="url(#dn-bread-clip)">
            <GrainOverlay prefix="dn" box={{ x: -160, y: -20, width: 320, height: 140 }} opacity={0.2} />
          </g>
          <Sesame seed="dn-sesam" count={28} />
        </>
      )}

      {/* Schaerfe */}
      {effects.spice > 0 && (
        <g opacity={0.55 + effects.spice * 0.1}>
          {bandPlacements("dn-spice", effects.spice * 8, {
            x: -100, y: FILL_TOP + 14, width: 200, height: 24, arc: 10,
          }).map((p, i) => (
            <rect key={i} x={p.x} y={p.y} width="4" height="2" rx="1" fill="#C0392B"
              transform={`rotate(${p.rot} ${p.x} ${p.y})`} />
          ))}
        </g>
      )}
    </svg>
  );
}
