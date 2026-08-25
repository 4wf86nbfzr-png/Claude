"use client";

import { motion } from "framer-motion";
import { AddSimpleButton } from "./AddSimpleButton";
import { formatPrice } from "@/lib/format";
import type { Category, Product } from "@/types/domain";

export function SimpleGrid({ category, products }: { category: Category; products: Product[] }) {
  return (
    <section id={category.slug} className="scroll-mt-24 border-t border-line py-14 lg:py-20">
      <p className="kicker">{category.claim}</p>
      <h2 className="display display-m mt-2">{category.name}</h2>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {products.map((product, i) => (
          <motion.article
            key={product.id}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.25) }}
            className="card flex flex-col p-5"
          >
            <h3 className="text-base font-bold">{product.name}</h3>
            <p className="mt-1 text-[0.8125rem] text-muted">{product.description}</p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="num text-base font-semibold">{formatPrice(product.basePrice)}</span>
              <AddSimpleButton product={product} />
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
