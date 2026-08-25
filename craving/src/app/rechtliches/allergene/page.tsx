import type { Metadata } from "next";
import { ADDITIVES, ALLERGENS, ALLERGEN_INDEX } from "@/data/allergens";
import { CROQUE_INGREDIENTS, DONER_INGREDIENTS, PIZZA_INGREDIENTS } from "@/data/ingredients";
import type { Ingredient } from "@/types/domain";

export const metadata: Metadata = {
  title: "Allergene & Zusatzstoffe",
  description: "Kennzeichnung aller Zutaten nach LMIV — pro Zutat einzeln aufgefuehrt.",
};

const GROUPS: Array<{ label: string; items: Ingredient[] }> = [
  { label: "Doener", items: DONER_INGREDIENTS },
  { label: "Pizza", items: PIZZA_INGREDIENTS },
  { label: "Croque", items: CROQUE_INGREDIENTS },
];

export default function AllergenePage() {
  return (
    <div className="shell pb-24 pt-28 lg:pt-36">
      <header className="max-w-3xl">
        <p className="kicker">Kennzeichnung</p>
        <h1 className="display display-l mt-2">Allergene & Zusatzstoffe</h1>
        <p className="lede mt-5">
          Jede Zutat einzeln, damit sich auch eine frei gebaute Kombination
          nachvollziehen laesst. Im Builder steht dieselbe Angabe hinter dem
          Info-Zeichen an jeder Zutat.
        </p>
      </header>

      <div className="mt-10 rounded-2xl border border-saffron/25 bg-saffron/8 p-5 text-[0.8125rem] leading-relaxed text-saffron">
        Testbetrieb: Die Angaben sind Demo-Daten. Vor dem Live-Gang muessen sie
        mit den Rezepturen und Lieferantenangaben des Betriebs abgeglichen werden.
      </div>

      <section className="mt-12">
        <h2 className="display display-m">Die 14 Hauptallergene</h2>
        <ul className="mt-5 flex flex-wrap gap-2">
          {ALLERGENS.map((a) => (
            <li key={a.code} className="rounded-full border border-line bg-ink-2 px-3.5 py-2 text-[0.8125rem]">
              {a.label}
            </li>
          ))}
        </ul>
      </section>

      {GROUPS.map((group) => (
        <section key={group.label} className="mt-14">
          <h2 className="display display-m">{group.label}</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="kicker py-3 pr-4 font-normal">Zutat</th>
                  <th scope="col" className="kicker py-3 pr-4 font-normal">Allergene</th>
                  <th scope="col" className="kicker py-3 pr-4 font-normal">kcal</th>
                  <th scope="col" className="kicker py-3 font-normal">Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((ing) => (
                  <tr key={ing.id} className="border-b border-line align-top">
                    <th scope="row" className="py-3 pr-4 text-left font-semibold text-paper">
                      {ing.name}
                    </th>
                    <td className="py-3 pr-4 text-chrome">
                      {ing.allergens.length
                        ? ing.allergens.map((c) => ALLERGEN_INDEX.get(c)?.label ?? c).join(", ")
                        : "—"}
                    </td>
                    <td className="num py-3 pr-4 text-chrome">{ing.nutrition?.kcal ?? "—"}</td>
                    <td className="py-3 text-muted">
                      {ing.tags?.join(", ") ?? ""}
                      {!ing.available && " · heute ausverkauft"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="mt-14">
        <h2 className="display display-m">Zusatzstoffe</h2>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ADDITIVES.map((a) => (
            <li key={a.code} className="card p-4 text-sm">
              <span className="num mr-2 text-muted">{a.code}</span>
              {a.label}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-12 max-w-[68ch] text-[0.8125rem] leading-relaxed text-muted">
        In einer offenen Kueche lassen sich Spuren anderer Allergene nicht
        ausschliessen. Bei Unvertraeglichkeiten bitte vor der Bestellung anrufen —
        wir sagen ehrlich, was geht und was nicht.
      </p>
    </div>
  );
}
