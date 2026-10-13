import type { Metadata } from "next";
import { DemoForm } from "./demo-form";

export const metadata: Metadata = { title: "Interaktive Demo", description: "Geben Sie eine Kundenanfrage ein und sehen Sie, wie Clairify sie einordnet und beantwortet." };

export default function Demo() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold md:text-4xl">Demo: Eine Anfrage, einmal durch Clairify</h1>
      <p className="mt-3 text-ink-2">Tippen Sie eine typische Kundenanfrage ein oder nehmen Sie ein Beispiel. Sie sehen Kategorie, Dringlichkeit, fehlende Angaben und den Antwortentwurf. Nichts wird gespeichert.</p>
      <DemoForm />
    </div>
  );
}
