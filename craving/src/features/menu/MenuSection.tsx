"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { rendererFor } from "@/features/builder/renderers";
import { optionEffects, selectedIngredients } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import type { Category, Product } from "@/types/domain";

/**
 * Ein Kategorieabschnitt im Menue: links die Buehne (auf grossen Schirmen
 * mitlaufend), rechts die Vorlagen als Liste. Die Karten wiederholen die
 * Produktdarstellung bewusst nicht — eine grosse Buehne wirkt staerker als
 * vierzehn kleine und ist deutlich guenstiger zu zeichnen.
 */
export function MenuSection({ category, products }: { category: Category; products: Product[] }) {
  const Renderer = rendererFor(category.id);
  const hero = useMemo(() => {
    const lead = products.find((p) => !p.freestyle) ?? products[0];
    const selections = lead?.preset ?? {};
    return {
      ingredients: selectedIngredients(category, selections),
      effects: optionEffects(category, selections),
    };
  }, [category, products]);

  return (
    <section id={category.slug} className="scroll-mt-24 border-t border-line py-14 lg:py-20">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="kicker">{category.claim}</p>
          <h2 className="display display-l mt-2">{category.name}</h2>
          <p className="lede mt-4 text-base">{category.description}</p>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto mt-8 aspect-square w-full max-w-md"
          >
            <div
              aria-hidden
              className="absolute inset-0 -z-10"
              style={{ background: `radial-gradient(55% 50% at 50% 45%, ${category.accent}1C, transparent 70%)` }}
            />
            <Renderer ingredients={hero.ingredients} effects={hero.effects} label={`${category.name} Vorschau`} />
          </motion.div>

          <Link
            href={`/bauen/${category.slug}`}
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-80"
            style={{ color: category.accent }}
          >
            Frei zusammenstellen
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <ul className="divide-y divide-[color:var(--color-line)] border-y border-line">
          {products.map((product, index) => (
            <motion.li
              key={product.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: Math.min(index * 0.04, 0.2) }}
            >
              <Link
                href={`/bauen/${category.slug}?produkt=${product.slug}`}
                className="group flex items-start gap-5 py-5 transition-colors hover:bg-white/[0.03] sm:px-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold tracking-tight">{product.name}</h3>
                    {product.badges?.map((b) => (
                      <span
                        key={b}
                        className="rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider"
                        style={{ background: `${category.accent}22`, color: category.accent }}
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 max-w-prose text-sm text-muted">{product.description}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num text-base font-semibold">{formatPrice(product.basePrice)}</span>
                  <span className="flex items-center gap-1 text-xs text-muted transition-colors group-hover:text-paper">
                    Bauen
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </div>
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
