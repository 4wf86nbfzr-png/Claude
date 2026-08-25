"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";
import { openingState } from "@/lib/opening";

/**
 * Zeigt den Betriebszustand. Berechnet sich erst im Browser — auf dem
 * Server waere die Uhrzeit die der Serverzone und beim Hydrieren falsch.
 */
export function OpenBadge({ className = "" }: { className?: string }) {
  const [state, setState] = useState<ReturnType<typeof openingState> | null>(null);

  useEffect(() => {
    const update = () => setState(openingState(new Date()));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Die Huelle steht immer und hat eine Mindestbreite: sonst springt die
  // Kopfzeile in dem Moment, in dem der Zustand feststeht (Layout Shift).
  return (
    <span
      className={`min-w-[10.5rem] items-center justify-center gap-2 rounded-full border border-line bg-ink-2 px-3 py-2 text-[0.6875rem] font-medium ${className}`}
    >
      {state && (
        <>
          <span
            className={`size-1.5 rounded-full ${state.open ? "bg-basil" : "bg-danger"}`}
            aria-hidden
          />
          <span className="text-chrome">
            {state.open
              ? `Geoeffnet${state.closesAt ? ` bis ${formatTime(state.closesAt)}` : ""}`
              : `Geschlossen${state.opensAt ? ` · ab ${formatTime(state.opensAt)}` : ""}`}
          </span>
        </>
      )}
    </span>
  );
}
