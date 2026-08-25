"use client";

import { useEffect } from "react";
import { useAccountStore } from "@/stores/account-store";
import { useCartStore } from "@/stores/cart-store";

/**
 * Liest die gespeicherten Stores erst NACH dem ersten Client-Render ein.
 * Damit stimmen Server- und Client-Markup ueberein (keine Hydration-Fehler),
 * und ein voller Warenkorb erscheint eine Frame spaeter statt gar nicht.
 */
export function StoreHydrator() {
  useEffect(() => {
    void useCartStore.persist.rehydrate();
    void useAccountStore.persist.rehydrate();
  }, []);
  return null;
}
