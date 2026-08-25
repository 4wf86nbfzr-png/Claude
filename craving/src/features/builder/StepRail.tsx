"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import clsx from "clsx";
import type { BuilderStep } from "@/types/domain";

/**
 * Fortschritt im Builder. Kein Assistent mit Zwang zur Reihenfolge —
 * die Schritte sind Sprungmarken. Wer nur die Sosse tauschen will, tippt
 * direkt darauf.
 */
export function StepRail({
  steps,
  activeId,
  completed,
  accent,
  onJump,
}: {
  steps: BuilderStep[];
  activeId: string | null;
  completed: Record<string, boolean>;
  accent: string;
  onJump: (id: string) => void;
}) {
  return (
    <nav aria-label="Schritte" className="no-scrollbar edge-scroll -mx-1 overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 px-1">
        {steps.map((step, index) => {
          const active = step.id === activeId;
          const done = completed[step.id];
          return (
            <li key={step.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onJump(step.id)}
                aria-current={active ? "step" : undefined}
                className={clsx(
                  "relative flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.8125rem] font-medium transition-colors",
                  active ? "text-paper" : "text-muted hover:text-chrome",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="step-pill"
                    className="absolute inset-0 -z-10 rounded-full border border-line bg-white/[0.07]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span
                  className={clsx(
                    "num grid size-5 place-items-center rounded-full text-[0.625rem] font-bold transition-colors",
                    done ? "text-black" : "border border-line text-muted",
                  )}
                  style={done ? { background: accent } : undefined}
                  aria-hidden
                >
                  {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
                </span>
                {step.label}
              </button>
              {index < steps.length - 1 && <span className="h-px w-3 bg-line" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
