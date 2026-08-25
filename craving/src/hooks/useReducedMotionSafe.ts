"use client";

import { useSyncExternalStore } from "react";

/**
 * `prefers-reduced-motion`, aber hydrationssicher.
 *
 * Der Server kennt die Einstellung des Geraets nicht. Wuerde der Client
 * sofort die reduzierte Variante rendern, unterscheidet sich das Markup
 * und React verwirft den Baum. `useSyncExternalStore` loest genau das:
 * beim Hydrieren gilt der Server-Wert (false), unmittelbar danach der
 * echte — und spaetere Aenderungen der Systemeinstellung kommen ueber das
 * Abonnement an.
 *
 * Fuer reine CSS-Animationen ist der Hook nicht noetig — die schaltet die
 * Media Query in globals.css bereits ab.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotionSafe(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
