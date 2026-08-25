"use client";

import { motion } from "framer-motion";
import { Hand, Bike, Sparkles } from "lucide-react";

const STEPS = [
  {
    icon: Hand,
    title: "Aussuchen",
    text: "Vorlage nehmen oder leer starten. Beides dauert gleich lange.",
  },
  {
    icon: Sparkles,
    title: "Bauen",
    text: "Jede Zutat landet sichtbar auf dem Essen. Der Preis rechnet live mit.",
  },
  {
    icon: Bike,
    title: "Bekommen",
    text: "Liefern lassen oder abholen. Status siehst du live.",
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="ablauf" className="shell border-t border-line py-20 lg:py-28">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <p className="kicker">So laeuft es</p>
          <h2 id="ablauf" className="display display-l mt-3">
            Drei Schritte.
            <br />
            Kein Formular.
          </h2>
        </div>

        <ol className="grid gap-px overflow-hidden rounded-[26px] border border-line bg-line sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <motion.li
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex flex-col gap-4 bg-ink-2 p-7"
            >
              <span className="num text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              <Icon className="size-6 text-ember" aria-hidden />
              <h3 className="text-lg font-bold tracking-tight">{title}</h3>
              <p className="text-sm leading-relaxed text-muted">{text}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
