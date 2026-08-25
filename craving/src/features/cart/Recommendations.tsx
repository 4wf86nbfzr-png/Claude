"use client";

import Link from "next/link";
import { AddSimpleButton } from "@/features/menu/AddSimpleButton";
import { RECOMMENDATIONS } from "@/data/marketing";
import { getCategory, getProduct } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/types/domain";

/**
 * Empfehlungen sind modular: ein Block je Regel, Reihenfolge aus den Daten.
 * Spaeter kann derselbe Block von einem Empfehlungsdienst befuellt werden —
 * das UI aendert sich dafuer nicht.
 */
export function Recommendations({
  cartCategories,
  limit = 2,
}: {
  cartCategories: string[];
  limit?: number;
}) {
  const blocks = RECOMMENDATIONS.filter(
    (r) => r.whenCategories.length === 0 || r.whenCategories.some((c) => cartCategories.includes(c)),
  ).slice(0, limit);

  if (blocks.length === 0) return null;

  return (
    <div className="space-y-8">
      {blocks.map((block) => {
        const products = block.productIds
          .map((id) => getProduct(id))
          .filter((p): p is Product => Boolean(p?.available));
        if (products.length === 0) return null;

        return (
          <section key={block.id} aria-labelledby={`rec-${block.id}`}>
            <h3 id={`rec-${block.id}`} className="kicker mb-3">
              {block.title}
            </h3>
            <ul className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {products.map((product) => {
                const category = getCategory(product.categoryId);
                return (
                  <li key={product.id} className="w-48 shrink-0">
                    <div className="card flex h-full flex-col p-4">
                      <h4 className="text-sm font-bold">{product.name}</h4>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{product.description}</p>
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <span className="num text-sm font-semibold">{formatPrice(product.basePrice)}</span>
                        {category?.simple ? (
                          <AddSimpleButton product={product} label="Dazu" />
                        ) : (
                          <Link
                            href={`/bauen/${category?.slug}?produkt=${product.slug}`}
                            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold transition hover:border-line-strong"
                          >
                            Bauen
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
