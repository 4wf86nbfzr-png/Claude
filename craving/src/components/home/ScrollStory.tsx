"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { FoodRender } from "@/features/builder/renderers";
import { Cinematic } from "./Cinematic";
import { optionEffects, selectedIngredients } from "@/lib/catalog";
import type { Category, Product } from "@/types/domain";
import { useReducedMotionSafe } from "@/hooks/useReducedMotionSafe";

/**
 * Die Erzaehl-Bahn der Startseite.
 *
 * Beim Scrollen wird das Produkt Zutat fuer Zutat zusammengesetzt: der
 * Fortschritt bestimmt, wie viele Ebenen sichtbar sind. Es ist derselbe
 * Renderer wie im Builder — die Startseite verspricht damit genau das, was
 * der Builder danach einloest.
 *
 * Ohne Bewegungswunsch (prefers-reduced-motion) steht das fertige Produkt
 * sofort da; gescrollt wird dann ganz normal.
 */
export function ScrollStory({
  category,
  product,
  index,
}: {
  category: Category;
  product: Product;
  index: number;
}) {
  const reduced = useReducedMotionSafe();
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  const ingredients = useMemo(
    () => selectedIngredients(category, product.preset),
    [category, product.preset],
  );
  const effects = useMemo(() => optionEffects(category, product.preset), [category, product.preset]);

  // Ebene fuer Ebene: 0 -> nur die Basis, 1 -> alles.
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const eased = Math.max(0, Math.min(1, (value - 0.12) / 0.62));
    setStep(Math.round(eased * ingredients.length));
  });

  const visible = reduced ? ingredients : ingredients.slice(0, step);
  const current = visible[visible.length - 1];

  const scale = useSpring(useTransform(scrollYProgress, [0, 0.3, 1], [0.82, 1, 1.04]), {
    stiffness: 90, damping: 22,
  });
  const rotate = useTransform(scrollYProgress, [0, 1], [category.id === "pizza" ? -14 : 0, 4]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.12, 0.86, 1], [0, 1, 1, 0]);

  return (
    <section
      ref={ref}
      aria-labelledby={`story-${category.id}`}
      className="relative h-[260svh] lg:h-[300svh]"
    >
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(58% 52% at 50% 46%, ${category.accent}1A, transparent 68%)` }}
        />

        <div className="shell grid w-full items-center gap-8 lg:grid-cols-2 lg:gap-16">
          <motion.div
            style={{ opacity: textOpacity }}
            className={`relative order-2 lg:order-none ${index % 2 === 1 ? "lg:order-2" : ""}`}
          >
            <p className="kicker">
              {String(index + 1).padStart(2, "0")} · {category.claim}
            </p>
            <h2 id={`story-${category.id}`} className="display display-l mt-3">
              {category.headline}
            </h2>
            <p className="lede mt-5">{category.description}</p>

            <div className="mt-7 flex min-h-[3.25rem] items-center">
              {current ? (
                <motion.span
                  key={current.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-3 rounded-full border border-line bg-ink-2 py-2 pl-2 pr-5"
                >
                  <span
                    className="grid size-8 place-items-center rounded-full text-[0.6875rem] font-bold text-black"
                    style={{ background: category.accent }}
                    aria-hidden
                  >
                    +
                  </span>
                  <span className="text-sm font-semibold">{current.name}</span>
                </motion.span>
              ) : (
                <span className="text-sm text-muted">Weiterscrollen — es wird gebaut.</span>
              )}
            </div>

            <Link
              href={`/bauen/${category.slug}`}
              className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: category.accent }}
            >
              Selbst bauen
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          </motion.div>

          <motion.div
            style={{ scale, rotate }}
            className={`relative order-1 mx-auto aspect-square w-full max-w-[min(80vw,30rem)] lg:max-w-[min(46vw,44rem)] lg:order-none ${
              index % 2 === 1 ? "lg:order-1" : ""
            }`}
          >
            <Cinematic categoryId={category.id} className="size-full">
              <FoodRender
                categoryId={category.id}
                ingredients={visible}
                effects={effects}
                label={`${category.name} wird zusammengestellt`}
              />
            </Cinematic>
          </motion.div>
        </div>

        {/* Fortschritt der Bahn */}
        <div className="absolute inset-x-0 bottom-8 hidden justify-center lg:flex" aria-hidden>
          <div className="flex items-center gap-2">
            {ingredients.map((ing, i) => (
              <span
                key={ing.id}
                className="h-0.5 w-8 rounded-full transition-colors duration-300"
                style={{ background: i < visible.length ? category.accent : "var(--color-line)" }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
