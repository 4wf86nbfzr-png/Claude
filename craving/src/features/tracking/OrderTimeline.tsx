"use client";

import { motion } from "framer-motion";
import { Bike, ChefHat, Check, Flame, MapPin, Receipt } from "lucide-react";
import { ORDER_STATUS_FLOW } from "@/data/config";
import { statusIndex } from "@/lib/orders";
import type { OrderStatus } from "@/types/domain";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";

const ICONS = [Receipt, ChefHat, Flame, Bike, MapPin, Check];

/**
 * Statusverlauf als Zeitstrahl: die Linie waechst mit, der aktive Punkt
 * pulsiert einmal pro Statuswechsel. Kein Dauer-Puls — das wuerde nach
 * "haengt" aussehen statt nach "laeuft".
 */
export function OrderTimeline({ status, pickup }: { status: OrderStatus; pickup: boolean }) {
  const reduced = useReducedMotionSafe();
  const steps = pickup
    ? ORDER_STATUS_FLOW.filter((s) => s.id !== "on_the_way" && s.id !== "nearby")
    : ORDER_STATUS_FLOW;
  const activeIndex = Math.max(0, steps.findIndex((s) => s.id === status));
  const progress = steps.length > 1 ? activeIndex / (steps.length - 1) : 0;

  return (
    <ol className="relative">
      <span className="absolute left-[1.4375rem] top-6 bottom-6 w-px bg-line" aria-hidden />
      <motion.span
        className="absolute left-[1.4375rem] top-6 w-px origin-top bg-ember"
        style={{ bottom: "1.5rem" }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: progress }}
        transition={reduced ? { duration: 0.2 } : { duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        aria-hidden
      />

      {steps.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        const Icon = ICONS[ORDER_STATUS_FLOW.findIndex((s) => s.id === step.id)] ?? Check;

        return (
          <li key={step.id} className="relative flex gap-4 py-4">
            <span
              className={`relative z-10 grid size-12 shrink-0 place-items-center rounded-full border transition-colors ${
                done || active ? "border-transparent bg-ember text-white" : "border-line bg-ink-2 text-muted"
              }`}
            >
              <Icon className="size-5" aria-hidden />
              {active && !reduced && (
                <motion.span
                  key={step.id}
                  className="absolute inset-0 rounded-full border-2 border-ember"
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{ duration: 1.1, repeat: 2, ease: "easeOut" }}
                  aria-hidden
                />
              )}
            </span>
            <div className="pt-1.5">
              <p className={`text-base font-semibold ${done || active ? "text-paper" : "text-muted"}`}>
                {step.label}
                {active && <span className="sr-only"> (aktueller Schritt)</span>}
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">{step.note}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export { statusIndex };
