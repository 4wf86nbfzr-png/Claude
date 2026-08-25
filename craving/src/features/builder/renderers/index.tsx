import { CroqueRenderer } from "./CroqueRenderer";
import { DonerRenderer } from "./DonerRenderer";
import { PizzaRenderer } from "./PizzaRenderer";
import type { RendererProps } from "./types";

/**
 * Produktdarstellung nach Kategorie.
 *
 * Bewusst eine ausgeschriebene Verzweigung statt einer Registry-Variablen:
 * so bleibt jede Darstellung ein statisch referenzierter Komponententyp
 * (React verliert sonst bei jedem Rendern den Zustand der Ebenen) und der
 * Compiler kann sie optimieren.
 *
 * Eine neue Kategorie braucht genau einen Zweig hier. Erweiterung auf 3D:
 * eine Implementierung mit React Three Fiber unter demselben Vertrag
 * (RendererProps) ergaenzen — die Konfigurationslogik bleibt unveraendert.
 * Siehe docs/ARCHITEKTUR.md.
 */
export function FoodRender({ categoryId, ...props }: RendererProps & { categoryId: string }) {
  switch (categoryId) {
    case "doener":
      return <DonerRenderer {...props} />;
    case "croque":
      return <CroqueRenderer {...props} />;
    case "pizza":
    default:
      return <PizzaRenderer {...props} />;
  }
}

export function hasRenderer(categoryId: string): boolean {
  return ["doener", "pizza", "croque"].includes(categoryId);
}

export type { RendererProps, FoodRenderer } from "./types";
