"use client";

import { Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label = "Menge",
  size = "md",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "size-8" : "size-11";
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-ink-3 p-1" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={`${dim} grid place-items-center rounded-full text-paper transition hover:bg-white/8 disabled:opacity-30`}
        aria-label="Weniger"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <motion.span
        key={value}
        initial={{ scale: 0.8, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 22 }}
        className="num min-w-8 text-center text-sm font-semibold"
        aria-live="polite"
      >
        {value}
      </motion.span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={`${dim} grid place-items-center rounded-full text-paper transition hover:bg-white/8 disabled:opacity-30`}
        aria-label="Mehr"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
