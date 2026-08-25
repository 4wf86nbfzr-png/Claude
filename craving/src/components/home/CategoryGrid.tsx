"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { FoodRender } from "@/features/builder/renderers";
import { optionEffects, selectedIngredients } from "@/lib/catalog";
import { productsOfCategory } from "@/data/products";
import { formatPrice } from "@/lib/format";
import type { Category } from "@/types/domain";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";

/**
 * Die Kategorie-Karten sind keine Shop-Kacheln: jede zeigt das echte
 * Produkt aus demselben Renderer, den auch der Builder benutzt. Beim
 * Zeigen kippt die Szene leicht mit — dieselbe Lichtachse wie im Builder.
 */
function CategoryCard({ category, index }: { category: Category; index: number }) {
  const reduced = useReducedMotionSafe();
  const cardRef = useRef<HTMLAnchorElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);

  const { ingredients, effects, from } = useMemo(() => {
    const products = productsOfCategory(category.id);
    const lead = products.find((p) => !p.freestyle) ?? products[0];
    const selections = lead?.preset ?? {};
    return {
      ingredients: selectedIngredients(category, selections),
      effects: optionEffects(category, selections),
      from: products.reduce((min, p) => Math.min(min, p.basePrice), Infinity),
    };
  }, [category]);


  const onMove = (e: React.MouseEvent) => {
    if (reduced || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    setTilt({
      x: ((e.clientY - r.top) / r.height - 0.5) * -10,
      y: ((e.clientX - r.left) / r.width - 0.5) * 12,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 1200 }}
    >
      <Link
        ref={cardRef}
        href={`/bauen/${category.slug}`}
        onMouseMove={onMove}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => {
          setHover(false);
          setTilt({ x: 0, y: 0 });
        }}
        className="group relative block overflow-hidden rounded-[26px] border border-line bg-ink-2 p-6 transition-colors duration-300 hover:border-line-strong sm:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: `radial-gradient(70% 60% at 50% 30%, ${category.accent}1F, transparent 70%)` }}
        />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="kicker">{String(index + 1).padStart(2, "0")}</p>
            <h3 className="display display-m mt-2">{category.name}</h3>
          </div>
          <span
            className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-muted transition-all duration-300 group-hover:border-transparent group-hover:text-black"
            style={hover ? { background: category.accent } : undefined}
            aria-hidden
          >
            <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:rotate-45" />
          </span>
        </div>

        <motion.div
          className="relative mx-auto my-6 aspect-square w-full max-w-[19rem]"
          animate={{ rotateX: tilt.x, rotateY: tilt.y, scale: hover && !reduced ? 1.05 : 1 }}
          transition={{ type: "spring", stiffness: 160, damping: 18 }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <FoodRender
            categoryId={category.id}
            ingredients={ingredients}
            effects={effects}
            label={`${category.name} Vorschau`}
          />
        </motion.div>

        <div className="relative">
          <p className="text-sm leading-relaxed text-chrome">{category.claim}</p>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <span className="num text-sm text-muted">ab {formatPrice(from)}</span>
            <span className="text-sm font-semibold" style={{ color: category.accent }}>
              Jetzt bauen
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {categories.map((c, i) => (
        <CategoryCard key={c.id} category={c} index={i} />
      ))}
    </div>
  );
}
