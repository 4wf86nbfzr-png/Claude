"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { AddSimpleButton } from "./AddSimpleButton";
import { MENU_DEALS } from "@/data/marketing";
import { getProduct } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/types/domain";

/**
 * Menue-Upsell. Der Vorteil steht als Betrag da, nicht als Prozentzahl —
 * "1,90 € gespart" versteht man schneller als "14 % Rabatt".
 *
 * Technisch wird das Menue als eigenes Produkt in den Warenkorb gelegt;
 * die enthaltenen Artikel stehen in der Beschreibung.
 */
export function MenuDeals() {
  const deals = MENU_DEALS.filter((d) => d.available);
  if (deals.length === 0) return null;

  return (
    <section aria-labelledby="menues" className="border-t border-line py-14 lg:py-20">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="kicker">Zusammen guenstiger</p>
          <h2 id="menues" className="display display-m mt-2">
            Menues
          </h2>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {deals.map((deal, i) => {
          const parts = deal.productIds
            .map((id) => getProduct(id))
            .filter((p): p is Product => Boolean(p));
          const single = parts.reduce((sum, p) => sum + p.basePrice, 0);
          const dealProduct: Product = {
            id: deal.id,
            slug: deal.id,
            categoryId: "sides",
            name: deal.name,
            description: deal.description,
            basePrice: deal.price,
            available: true,
            preset: {},
          };

          return (
            <motion.article
              key={deal.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="card flex flex-col p-6"
            >
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-ember/12 px-2.5 py-1 text-[0.6875rem] font-semibold text-ember">
                <Sparkles className="size-3" aria-hidden />
                {formatPrice(deal.saving)} gespart
              </span>
              <h3 className="mt-4 text-xl font-bold tracking-tight">{deal.name}</h3>
              <p className="mt-1.5 text-sm text-muted">{deal.description}</p>

              <ul className="mt-4 space-y-1 text-sm text-chrome">
                {parts.map((p) => (
                  <li key={p.id} className="flex justify-between gap-4">
                    <span>{p.name}</span>
                    <span className="num text-muted">{formatPrice(p.basePrice)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto flex items-end justify-between gap-4 border-t border-line pt-5">
                <div>
                  <p className="num text-sm text-muted line-through">{formatPrice(single)}</p>
                  <p className="num text-2xl font-bold">{formatPrice(deal.price)}</p>
                </div>
                <AddSimpleButton product={dealProduct} label="Menue nehmen" />
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
