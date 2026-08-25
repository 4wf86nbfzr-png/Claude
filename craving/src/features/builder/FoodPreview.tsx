"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { FoodRender } from "./renderers";
import type { Ingredient } from "@/types/domain";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";

/**
 * Die Buehne des Builders.
 *
 * Das Produkt bleibt immer sichtbar (Desktop: sticky, Mobil: oben fixiert)
 * und laesst sich drehen und zoomen. Gedreht wird um die Achse, die zum
 * Produkt passt: die Pizza in der Ebene, Doener und Croque leicht raeumlich.
 */
export const FoodPreview = forwardRef<HTMLDivElement, {
  categoryId: string;
  ingredients: Ingredient[];
  effects: { sizeScale: number; spice: number; variants: string[] };
  label: string;
  accent: string;
  compact?: boolean;
}>(function FoodPreview({ categoryId, ingredients, effects, label, accent, compact = false }, ref) {
  const reduced = useReducedMotionSafe();
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const flat = categoryId === "pizza";

  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  const spin = useSpring(useTransform(dragX, (v) => (flat ? v * 0.35 : 0)), { stiffness: 120, damping: 20 });
  const tiltY = useSpring(
    useTransform([dragX, pointerX] as const, ([d, p]: number[]) =>
      flat ? (p ?? 0) * 6 : Math.max(-26, Math.min(26, (d ?? 0) * 0.12)) + (p ?? 0) * 5,
    ),
    { stiffness: 120, damping: 18 },
  );
  const tiltX = useSpring(
    useTransform([dragY, pointerY] as const, ([d, p]: number[]) =>
      Math.max(-18, Math.min(18, (d ?? 0) * -0.06 + (p ?? 0) * -5)),
    ),
    { stiffness: 120, damping: 18 },
  );

  useEffect(() => {
    if (reduced) return;
    const node = stageRef.current;
    if (!node) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = node.getBoundingClientRect();
      pointerX.set(((e.clientX - r.left) / r.width - 0.5) * 2);
      pointerY.set(((e.clientY - r.top) / r.height - 0.5) * 2);
    };
    const onLeave = () => {
      pointerX.set(0);
      pointerY.set(0);
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, [pointerX, pointerY, reduced]);

  const reset = () => {
    dragX.set(0);
    dragY.set(0);
    setZoom(1);
  };

  return (
    <div ref={ref} className="relative flex h-full w-full flex-col items-center justify-center">
      {/* Warme Lichtstimmung unter dem Produkt — kein Deko-Verlauf, sondern
          die Lichtquelle, die auch die Schatten im SVG erklaert. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(60% 55% at 50% 42%, ${accent}22, transparent 70%)`,
        }}
      />

      <div
        ref={stageRef}
        // Das SVG passt sich per viewBox in die Box ein (preserveAspectRatio),
        // deshalb keine feste Seitenverhaeltnis-Box: sonst laeuft die Buehne
        // auf niedrigen Viewports aus dem Bild.
        className="relative h-full max-h-full w-full touch-pan-y select-none"
        style={{ perspective: 1400 }}
      >
        <motion.div
          className="size-full cursor-grab active:cursor-grabbing"
          drag
          dragConstraints={{ left: -220, right: 220, top: -120, bottom: 120 }}
          dragElastic={0.16}
          dragMomentum={false}
          style={{
            x: 0,
            y: 0,
            rotate: flat ? spin : 0,
            rotateY: reduced ? 0 : tiltY,
            rotateX: reduced ? 0 : tiltX,
            transformStyle: "preserve-3d",
          }}
          onDrag={(_, info) => {
            dragX.set(info.offset.x);
            dragY.set(info.offset.y);
          }}
          animate={{ scale: zoom * effects.sizeScale * (compact ? 0.86 : 1) }}
          transition={{ type: "spring", stiffness: 180, damping: 22 }}
        >
          <FoodRender categoryId={categoryId} ingredients={ingredients} effects={effects} label={label} />
        </motion.div>
      </div>

      {/* Auf dem Telefon zaehlt jeder Pixel: dort wird gewischt und gezogen,
          die Bedienleiste erscheint erst ab Tablet. */}
      <div className="mt-4 hidden items-center gap-2 lg:mt-6 lg:flex">
        <div className="glass flex items-center gap-1 rounded-full p-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}
            className="grid size-9 place-items-center rounded-full text-chrome transition hover:bg-white/8 hover:text-paper"
            aria-label="Verkleinern"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <span className="num w-12 text-center text-xs text-muted" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.15).toFixed(2)))}
            className="grid size-9 place-items-center rounded-full text-chrome transition hover:bg-white/8 hover:text-paper"
            aria-label="Vergroessern"
          >
            <Plus className="size-4" aria-hidden />
          </button>
          <span className="h-5 w-px bg-line" aria-hidden />
          <button
            type="button"
            onClick={reset}
            className="grid size-9 place-items-center rounded-full text-chrome transition hover:bg-white/8 hover:text-paper"
            aria-label="Ansicht zuruecksetzen"
          >
            <RotateCcw className="size-4" aria-hidden />
          </button>
        </div>
        <p className="hidden items-center gap-1.5 text-[0.6875rem] text-muted lg:flex">
          <Maximize2 className="size-3" aria-hidden />
          Ziehen zum Drehen
        </p>
      </div>
    </div>
  );
});
