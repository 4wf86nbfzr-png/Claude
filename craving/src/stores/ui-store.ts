"use client";

import { create } from "zustand";
import { uid } from "@/lib/id";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: "success" | "info" | "error";
  /** Millisekunden bis zum automatischen Ausblenden. */
  duration: number;
}

/** Flugbahn beim "In den Warenkorb"-Moment: Start, Ziel, Groesse. */
export interface FlightOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Mittelpunkt des Warenkorb-Symbols. */
  targetX: number;
  targetY: number;
  categoryId: string;
  key: string;
}

interface UiState {
  toasts: Toast[];
  flight: FlightOrigin | null;
  cartOpen: boolean;

  toast: (t: Omit<Toast, "id" | "duration" | "tone"> & { tone?: Toast["tone"]; duration?: number }) => void;
  dismiss: (id: string) => void;
  launchFlight: (origin: Omit<FlightOrigin, "key">) => void;
  endFlight: () => void;
  setCartOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  toasts: [],
  flight: null,
  cartOpen: false,

  toast: ({ tone = "success", duration = 3200, ...rest }) =>
    set((s) => ({ toasts: [...s.toasts, { id: uid("toast"), tone, duration, ...rest }].slice(-3) })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  launchFlight: (origin) => set({ flight: { ...origin, key: uid("flight") } }),
  endFlight: () => set({ flight: null }),
  setCartOpen: (cartOpen) => set({ cartOpen }),
}));
