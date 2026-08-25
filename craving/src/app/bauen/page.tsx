import type { Metadata } from "next";
import { BUILDER_CATEGORIES } from "@/data/categories";
import { CategoryGrid } from "@/components/home/CategoryGrid";

export const metadata: Metadata = {
  title: "Was bauen wir heute?",
  description: "Doener, Pizza oder Croque — Zutat fuer Zutat selbst zusammenstellen.",
};

export default function BuildIndexPage() {
  return (
    <div className="shell pb-24 pt-28 lg:pt-36">
      <header className="max-w-3xl">
        <p className="kicker">Schritt 1 von 3</p>
        <h1 className="display display-l mt-3">Was bauen wir heute?</h1>
        <p className="lede mt-5">
          Drei Baustellen. Du entscheidest, was reinkommt — und siehst dabei zu.
        </p>
      </header>
      <div className="mt-14">
        <CategoryGrid categories={BUILDER_CATEGORIES} />
      </div>
    </div>
  );
}
