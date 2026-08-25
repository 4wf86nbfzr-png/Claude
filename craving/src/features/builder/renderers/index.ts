import { CroqueRenderer } from "./CroqueRenderer";
import { DonerRenderer } from "./DonerRenderer";
import { PizzaRenderer } from "./PizzaRenderer";
import type { FoodRenderer } from "./types";

/**
 * Renderer-Register.
 *
 * Eine neue Kategorie braucht genau einen Eintrag hier. Solange keiner
 * existiert, faellt der Builder auf die Pizza-Darstellung zurueck (Kreis),
 * statt einen leeren Rahmen zu zeigen.
 *
 * Erweiterung auf 3D: eine Implementierung mit React Three Fiber unter
 * demselben Vertrag (RendererProps) registrieren — die Konfigurations-
 * logik bleibt unveraendert. Siehe docs/ARCHITEKTUR.md.
 */
const RENDERERS: Record<string, FoodRenderer> = {
  pizza: PizzaRenderer,
  doener: DonerRenderer,
  croque: CroqueRenderer,
};

export function rendererFor(categoryId: string): FoodRenderer {
  return RENDERERS[categoryId] ?? PizzaRenderer;
}

export type { RendererProps, FoodRenderer } from "./types";
