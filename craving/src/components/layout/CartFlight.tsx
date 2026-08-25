"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUiStore } from "@/stores/ui-store";
import { CATEGORY_INDEX } from "@/data/categories";

interface Target { x: number; y: number }

/**
 * Der "In den Warenkorb"-Moment: das Produkt schrumpft und fliegt zum
 * Warenkorb-Symbol. Gerendert wird eine schlichte Scheibe in der
 * Kategoriefarbe — ein Klon des SVG-Produkts waere schoen, kostet beim
 * Flug aber deutlich mehr Rechenzeit als er einbringt.
 */
export function CartFlight() {
  const flight = useUiStore((s) => s.flight);
  const endFlight = useUiStore((s) => s.endFlight);
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    if (!flight) return;
    const node = document.querySelector("[data-cart-target]");
    if (!node) {
      endFlight();
      return;
    }
    const rect = node.getBoundingClientRect();
    setTarget({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const timer = setTimeout(endFlight, 750);
    return () => clearTimeout(timer);
  }, [flight, endFlight]);

  const accent = flight ? CATEGORY_INDEX.get(flight.categoryId)?.accent ?? "#FF5A1F" : "#FF5A1F";

  return (
    <AnimatePresence>
      {flight && target && (
        <motion.div
          key={flight.key}
          className="pointer-events-none fixed z-[85] rounded-full"
          style={{
            left: flight.x,
            top: flight.y,
            width: flight.width,
            height: flight.height,
            background: `radial-gradient(circle at 35% 30%, ${accent}, rgba(0,0,0,0.9))`,
            boxShadow: `0 18px 50px -20px ${accent}`,
          }}
          initial={{ scale: 1, opacity: 0.95, x: 0, y: 0 }}
          animate={{
            x: target.x - flight.x - flight.width / 2,
            y: target.y - flight.y - flight.height / 2,
            scale: 0.12,
            opacity: 0.85,
          }}
          exit={{ opacity: 0, scale: 0.05 }}
          transition={{ duration: 0.62, ease: [0.32, 0, 0.24, 1] }}
        />
      )}
    </AnimatePresence>
  );
}
