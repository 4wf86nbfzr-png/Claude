"use client";

import { useSyncExternalStore } from "react";

/**
 * true auf Touch-Geraeten. Hydrationssicher (Server: false), damit
 * Gesten-Varianten das Markup nicht auseinanderlaufen lassen.
 */
const QUERY = "(pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
