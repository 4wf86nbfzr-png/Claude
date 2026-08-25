"use client";

import { AnimatePresence, motion } from "framer-motion";
import { formatPrice } from "@/lib/format";

/**
 * Preis, der bei Aenderung kurz nach oben rollt. Ohne Layout-Sprung:
 * die Zeile hat feste Hoehe, die Ziffern wechseln darin.
 */
export function AnimatedPrice({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`relative inline-flex overflow-hidden ${className}`} aria-label={formatPrice(value)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "70%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-70%", opacity: 0, position: "absolute" }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="num tabular-nums"
          aria-hidden
        >
          {formatPrice(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
