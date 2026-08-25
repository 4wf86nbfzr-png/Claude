"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/lib/storage";
import { uid } from "@/lib/id";
import type { CartItem, Fulfillment, Selections } from "@/types/domain";

export interface NewCartItem {
  productId: string;
  categoryId: string;
  name: string;
  unitPrice: number;
  selections: Selections;
  added: string[];
  removed: string[];
  quantity?: number;
  note?: string;
}

interface CartState {
  items: CartItem[];
  fulfillment: Fulfillment;
  postalCode: string;
  couponCode: string;
  tipPercent: number;
  tipAbsolute?: number;
  /** Wird nach jedem Hinzufuegen erhoeht — treibt die Warenkorb-Animation. */
  pulse: number;

  add: (item: NewCartItem) => string;
  update: (id: string, patch: Partial<Omit<CartItem, "id">>) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  setFulfillment: (f: Fulfillment) => void;
  setPostalCode: (plz: string) => void;
  setCoupon: (code: string) => void;
  setTipPercent: (percent: number) => void;
  setTipAbsolute: (cents: number | undefined) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      fulfillment: "delivery",
      postalCode: "",
      couponCode: "",
      tipPercent: 0,
      tipAbsolute: undefined,
      pulse: 0,

      add: (item) => {
        const id = uid("line");
        const entry: CartItem = {
          id,
          productId: item.productId,
          categoryId: item.categoryId,
          name: item.name,
          quantity: Math.max(1, item.quantity ?? 1),
          unitPrice: item.unitPrice,
          selections: item.selections,
          added: item.added,
          removed: item.removed,
          note: item.note,
          createdAt: Date.now(),
        };

        // Identische Konfiguration? Dann Menge erhoehen statt Zeile doppeln.
        const fingerprint = JSON.stringify([entry.productId, entry.selections, entry.note ?? ""]);
        const twin = get().items.find(
          (i) => JSON.stringify([i.productId, i.selections, i.note ?? ""]) === fingerprint,
        );
        if (twin) {
          set((s) => ({
            items: s.items.map((i) =>
              i.id === twin.id ? { ...i, quantity: i.quantity + entry.quantity } : i,
            ),
            pulse: s.pulse + 1,
          }));
          return twin.id;
        }

        set((s) => ({ items: [...s.items, entry], pulse: s.pulse + 1 }));
        return id;
      },

      update: (id, patch) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),

      setQuantity: (id, quantity) =>
        set((s) => ({
          items:
            quantity <= 0
              ? s.items.filter((i) => i.id !== id)
              : s.items.map((i) => (i.id === id ? { ...i, quantity: Math.min(99, quantity) } : i)),
        })),

      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [], couponCode: "", tipPercent: 0, tipAbsolute: undefined }),
      setFulfillment: (fulfillment) => set({ fulfillment }),
      setPostalCode: (postalCode) => set({ postalCode }),
      setCoupon: (couponCode) => set({ couponCode }),
      setTipPercent: (tipPercent) => set({ tipPercent, tipAbsolute: undefined }),
      setTipAbsolute: (tipAbsolute) => set({ tipAbsolute }),
    }),
    {
      name: "craving.cart.v1",
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ items, fulfillment, postalCode, couponCode, tipPercent, tipAbsolute }) => ({
        items, fulfillment, postalCode, couponCode, tipPercent, tipAbsolute,
      }),
      // Bewusst manuell: sonst rendert der Server einen leeren Warenkorb und
      // der Client sofort einen vollen -> Hydration-Fehler. Die Rehydrierung
      // stoesst <StoreHydrator/> nach dem ersten Client-Render an.
      skipHydration: true,
    },
  ),
);

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}
