"use client";

import { useEffect, useState } from "react";
import { useAccountStore } from "@/stores/account-store";
import { useCartStore } from "@/stores/cart-store";

/**
 * true, sobald die persistierten Stores im Browser eingelesen sind.
 * Vorher zeigen Komponenten den serverseitigen (leeren) Zustand —
 * so gibt es keine Hydration-Warnungen.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const check = () => setHydrated(useCartStore.persist.hasHydrated());
    check();
    const unsubCart = useCartStore.persist.onFinishHydration(check);
    const unsubAccount = useAccountStore.persist.onFinishHydration(check);
    return () => {
      unsubCart();
      unsubAccount();
    };
  }, []);
  return hydrated;
}
