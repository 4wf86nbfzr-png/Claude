"use client";

import { useRouter } from "next/navigation";
import { useCartStore } from "@/stores/cart-store";
import { useUiStore } from "@/stores/ui-store";
import type { CartItem } from "@/types/domain";

/**
 * Express-Reorder: eine frühere Bestellung komplett in den Korb legen.
 * Grundlage fuer "Nochmal bestellen" im Konto — spaeter identisch nutzbar,
 * wenn die Bestellungen vom Server kommen.
 */
export function useReorder() {
  const add = useCartStore((s) => s.add);
  const toast = useUiStore((s) => s.toast);
  const router = useRouter();

  return (items: CartItem[], options: { goToCart?: boolean } = {}) => {
    for (const item of items) {
      add({
        productId: item.productId,
        categoryId: item.categoryId,
        name: item.name,
        unitPrice: item.unitPrice,
        selections: item.selections,
        added: item.added,
        removed: item.removed,
        quantity: item.quantity,
        note: item.note,
      });
    }
    navigator.vibrate?.(12);
    toast({
      title: items.length === 1 ? "Wieder im Korb" : `${items.length} Positionen wieder im Korb`,
      description: "Preise sind auf dem aktuellen Stand.",
      tone: "success",
    });
    if (options.goToCart !== false) router.push("/warenkorb");
  };
}
