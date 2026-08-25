import type { Metadata } from "next";
import Link from "next/link";
import { MenuSection } from "@/features/menu/MenuSection";
import { SimpleGrid } from "@/features/menu/SimpleGrid";
import { MenuDeals } from "@/features/menu/MenuDeals";
import { CATEGORIES } from "@/data/categories";
import { productsOfCategory } from "@/data/products";

export const metadata: Metadata = {
  title: "Menue",
  description:
    "Alle Vorlagen fuer Doener, Pizza und Croque — plus Beilagen, Getraenke und Menues. Jede Vorlage laesst sich frei umbauen.",
};

export default function MenuPage() {
  const sections = [...CATEGORIES].sort((a, b) => a.order - b.order);

  return (
    <div className="shell pb-24 pt-28 lg:pt-36">
      <header className="max-w-4xl">
        <p className="kicker">Die Karte</p>
        <h1 className="display display-l mt-3">Alles, was du bauen kannst.</h1>
        <p className="lede mt-5">
          Jede Vorlage ist nur ein Startpunkt. Zutaten raus, Zutaten rein — der Preis
          rechnet mit.
        </p>
      </header>

      <nav aria-label="Kategorien" className="no-scrollbar edge-scroll sticky top-16 z-30 -mx-[clamp(1.25rem,4vw,4.5rem)] mt-8 flex gap-2 overflow-x-auto bg-ink/85 px-[clamp(1.25rem,4vw,4.5rem)] py-3 backdrop-blur-lg lg:top-20">
        {sections.map((c) => (
          <Link
            key={c.id}
            href={`#${c.slug}`}
            className="shrink-0 rounded-full border border-line px-4 py-2 text-[0.8125rem] font-medium text-chrome transition hover:border-line-strong hover:text-paper"
          >
            {c.name}
          </Link>
        ))}
        <Link
          href="#menues"
          className="shrink-0 rounded-full border border-line px-4 py-2 text-[0.8125rem] font-medium text-chrome transition hover:border-line-strong hover:text-paper"
        >
          Menues
        </Link>
      </nav>

      {sections.map((category) =>
        category.simple ? (
          <SimpleGrid key={category.id} category={category} products={productsOfCategory(category.id)} />
        ) : (
          <MenuSection key={category.id} category={category} products={productsOfCategory(category.id)} />
        ),
      )}

      <MenuDeals />
    </div>
  );
}
