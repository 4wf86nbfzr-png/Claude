"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

/** Fortschritt im Bestellvorgang — jederzeit sichtbar, auch auf dem Telefon. */
export function StepIndicator({
  steps,
  current,
  onJump,
}: {
  steps: string[];
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <ol className="no-scrollbar edge-scroll flex items-center gap-2 overflow-x-auto py-1" aria-label="Fortschritt">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => (done ? onJump(index) : undefined)}
              disabled={!done}
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
                active ? "text-paper" : done ? "text-chrome hover:text-paper" : "text-muted"
              } ${done ? "cursor-pointer" : "cursor-default"}`}
            >
              <span
                className={`num grid size-5 place-items-center rounded-full text-[0.625rem] font-bold ${
                  done ? "bg-ember text-white" : active ? "bg-paper text-black" : "border border-line text-muted"
                }`}
                aria-hidden
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
              </span>
              {label}
            </button>
            {index < steps.length - 1 && (
              <span className="h-px w-6 bg-line" aria-hidden>
                {active && (
                  <motion.span
                    layoutId="checkout-progress"
                    className="block h-px w-full bg-ember"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
