"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { FoodBuilder } from "./FoodBuilder";
import { getCategory, initialSelections } from "@/lib/catalog";
import { productsOfCategory, PRODUCT_INDEX } from "@/data/products";
import { useAccountStore } from "@/stores/account-store";
import { useCartStore } from "@/stores/cart-store";
import type { Selections } from "@/types/domain";

/**
 * Verbindet die Route mit dem Builder:
 *   ?produkt=slug        Vorlage waehlen
 *   ?favorit=id          gespeicherte Konfiguration laden
 *   ?bearbeiten=lineId   Warenkorbzeile aendern
 */
export function BuilderScreen({ categoryId }: { categoryId: string }) {
  const params = useSearchParams();
  const category = getCategory(categoryId);
  const productSlug = params.get("produkt");
  const favoriteId = params.get("favorit");
  const editId = params.get("bearbeiten");

  const favorites = useAccountStore((s) => s.favorites);
  const items = useCartStore((s) => s.items);

  const products = useMemo(() => productsOfCategory(categoryId), [categoryId]);

  const { product, selections } = useMemo(() => {
    if (!category) return { product: undefined, selections: undefined };

    if (editId) {
      const line = items.find((i) => i.id === editId);
      if (line) {
        const p = PRODUCT_INDEX.get(line.productId) ?? products[0];
        return { product: p, selections: line.selections as Selections };
      }
    }
    if (favoriteId) {
      const fav = favorites.find((f) => f.id === favoriteId);
      if (fav) {
        const p = PRODUCT_INDEX.get(fav.productId) ?? products[0];
        return { product: p, selections: fav.selections };
      }
    }
    const bySlug = productSlug ? products.find((p) => p.slug === productSlug) : undefined;
    const chosen = bySlug ?? products.find((p) => p.freestyle) ?? products[0];
    return { product: chosen, selections: chosen ? initialSelections(category, chosen) : undefined };
  }, [category, editId, favoriteId, productSlug, items, favorites, products]);

  if (!category || !product || !selections) return null;

  return (
    <FoodBuilder
      key={`${product.id}-${editId ?? favoriteId ?? "neu"}`}
      category={category}
      product={product}
      presetSelections={selections}
      editLineId={editId ?? undefined}
    />
  );
}
