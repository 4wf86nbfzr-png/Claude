"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { AnimatedPrice } from "@/components/ui/Price";
import { formatPrice } from "@/lib/format";
import type { PriceBreakdown } from "@/lib/pricing";

/**
 * Preis mit aufklappbarer Herleitung. Der Nutzer soll nie raten muessen,
 * wovon der Betrag kommt — besonders wenn die Groesse die Extras verteuert.
 */
export function PriceCalculator({
  breakdown,
  quantity,
  productName,
}: {
  breakdown: PriceBreakdown;
  quantity: number;
  productName: string;
}) {
  const [open, setOpen] = useState(false);
  const total = breakdown.unit * quantity;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-[0.8125rem] text-muted">{productName}</span>
          <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted">
            Preis ansehen
            <ChevronDown
              className={`size-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </span>
        </span>
        <AnimatedPrice value={total} className="text-2xl font-bold" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[0.8125rem]">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Grundpreis</dt>
                <dd className="num">{formatPrice(breakdown.base)}</dd>
              </div>
              {breakdown.lines.map((line) => (
                <div key={line.id} className="flex justify-between gap-4">
                  <dt className="text-muted">{line.name}</dt>
                  <dd className="num">{formatPrice(line.amount)}</dd>
                </div>
              ))}
              {quantity > 1 && (
                <div className="flex justify-between gap-4 border-t border-line pt-1.5">
                  <dt className="text-muted">{quantity} ×</dt>
                  <dd className="num">{formatPrice(breakdown.unit)}</dd>
                </div>
              )}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
