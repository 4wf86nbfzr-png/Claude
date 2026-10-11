"use client";

import { createContext, useContext } from "react";
import type { ActionState } from "@/lib/action-result";

export const FormStateContext = createContext<ActionState>(null);

/** Wert eines Feldes nach fehlgeschlagener Server Action (React setzt Formulare sonst zurück). */
export function useRetainedValue(name: string | undefined): string | undefined {
  const state = useContext(FormStateContext);
  if (!name || !state || state.ok) return undefined;
  const v = state.values?.[name];
  return typeof v === "string" ? v : undefined;
}
