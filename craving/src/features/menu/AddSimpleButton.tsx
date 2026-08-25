"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";
import { useCartStore } from "@/stores/cart-store";
import { useUiStore } from "@/stores/ui-store";
import type { Product } from "@/types/domain";

/**
 * Beilagen und Getraenke haben keinen Builder — ein Tippen genuegt.
 * Der Flug in den Warenkorb startet am Knopf selbst.
 */
export function AddSimpleButton({ product, label = "Hinzufuegen" }: { product: Product; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const add = useCartStore((s) => s.add);
  const launchFlight = useUiStore((s) => s.launchFlight);
  const toast = useUiStore((s) => s.toast);

  return (
    <button
      ref={ref}
      type="button"
      disabled={!product.available}
      onClick={() => {
        const rect = ref.current?.getBoundingClientRect();
        if (rect) {
          launchFlight({
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            categoryId: product.categoryId,
          });
        }
        add({
          productId: product.id,
          categoryId: product.categoryId,
          name: product.name,
          unitPrice: product.basePrice,
          selections: {},
          added: [],
          removed: [],
        });
        navigator.vibrate?.(10);
        toast({ title: `${product.name} liegt im Korb`, tone: "success" });
      }}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-ink-3 px-4 text-[0.8125rem] font-semibold transition hover:border-line-strong hover:bg-ink-4 disabled:opacity-40"
    >
      <Plus className="size-4" aria-hidden />
      {label}
    </button>
  );
}
