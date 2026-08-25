"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowDown, ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { rendererFor } from "@/features/builder/renderers";
import { getCategory, optionEffects, selectedIngredients } from "@/lib/catalog";
import { getProduct } from "@/lib/catalog";
import { BRAND } from "@/data/config";

/**
 * Der Hero.
 *
 * Ein grosses Produkt, das auf Zeiger- und Geraetebewegung reagiert, und
 * eine Zeile, die keine Erklaerung braucht. Beim Scrollen sinkt das Bild
 * langsamer als der Text — die Tiefe entsteht aus dem Versatz, nicht aus
 * einem Effekt.
 */
export function Hero() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [0, 160]), { stiffness: 90, damping: 24 });
  const textY = useSpring(useTransform(scrollYProgress, [0, 1], [0, -70]), { stiffness: 90, damping: 24 });
  const fade = useTransform(scrollYProgress, [0, 0.85], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);

  const category = getCategory("pizza");
  const product = getProduct("pizza-salami");
  const Renderer = rendererFor("pizza");
  const selections = product?.preset ?? {};

  useEffect(() => {
    if (reduced) return;

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      setTilt({
        x: (e.clientY / window.innerHeight - 0.5) * -12,
        y: (e.clientX / window.innerWidth - 0.5) * 16,
      });
    };
    // Auf dem Telefon uebernimmt der Lagesensor — dieselbe Bewegung,
    // andere Eingabe. Ohne Sensor passiert schlicht nichts.
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      setTilt({
        x: Math.max(-12, Math.min(12, (e.beta - 45) * 0.25)),
        y: Math.max(-16, Math.min(16, e.gamma * 0.3)),
      });
    };

    window.addEventListener("pointermove", onPointer);
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, [reduced]);

  if (!category) return null;

  return (
    <section
      ref={ref}
      className="grain relative flex min-h-[100svh] flex-col justify-end overflow-hidden pb-16 pt-28 lg:min-h-[104svh] lg:justify-center lg:pb-0"
      aria-labelledby="hero-title"
    >
      {/* Licht von oben links, wie in der Kueche ueber der Arbeitsflaeche */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: "radial-gradient(70% 60% at 22% 8%, rgba(255,90,31,0.20), transparent 62%)" }}
      />

      <motion.div
        aria-hidden
        style={{ y, scale, opacity: fade, perspective: 1400 }}
        // Auf dem Telefon liegt der Text ueber dem Produkt. Statt einen
        // Schleier darueberzulegen, laeuft das Produkt selbst nach unten ins
        // Schwarz aus — das haelt die Szene ruhig und den Text lesbar.
        className="pointer-events-none absolute inset-x-0 top-[2%] z-[1] mx-auto aspect-square w-[100vw] max-w-none [mask-image:linear-gradient(to_bottom,#000_46%,transparent_88%)] sm:top-[6%] sm:w-[76vw] lg:right-[-6%] lg:left-auto lg:top-1/2 lg:w-[62vw] lg:-translate-y-1/2 lg:[mask-image:none] xl:w-[56vw]"
      >
        <motion.div
          className="size-full"
          animate={{ rotateX: tilt.x, rotateY: tilt.y }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <Renderer
            ingredients={selectedIngredients(category, selections)}
            effects={optionEffects(category, selections)}
            label=""
          />
        </motion.div>
      </motion.div>

      <motion.div style={{ y: textY }} className="shell relative z-[3]">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="kicker"
        >
          {BRAND.subline}
        </motion.p>

        <h1 id="hero-title" className="display display-xl mt-5 max-w-[16ch]">
          {["Build", "your", "craving."].map((word, i) => (
            <span key={word} className="block overflow-hidden">
              <motion.span
                className="block"
                initial={{ y: "110%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.9, delay: 0.08 * i, ease: [0.16, 1, 0.3, 1] }}
              >
                {word}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45 }}
          className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center"
        >
          <ButtonLink href="/bauen" size="lg" className="w-full sm:w-auto">
            Jetzt bauen
            <ArrowRight className="size-[18px]" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/menue" variant="outline" size="lg" className="w-full sm:w-auto">
            Karte ansehen
          </ButtonLink>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="mt-10 max-w-sm text-sm leading-relaxed text-muted"
        >
          Jede Zutat, die du auswaehlst, landet sichtbar auf deinem Essen.
          Kein Kreuzchen-Formular — du siehst, was du bekommst.
        </motion.p>
      </motion.div>

      <motion.div
        style={{ opacity: fade }}
        className="shell relative z-[3] mt-12 hidden items-center gap-2 text-[0.6875rem] uppercase tracking-[0.24em] text-muted lg:flex"
        aria-hidden
      >
        <ArrowDown className="size-3.5" />
        Scrollen
      </motion.div>
    </section>
  );
}
