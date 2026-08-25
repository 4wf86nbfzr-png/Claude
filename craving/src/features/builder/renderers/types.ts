import type { Ingredient } from "@/types/domain";

/**
 * Vertrag zwischen Builder und Produktdarstellung.
 *
 * Der Builder weiss nichts darueber, wie eine Pizza aussieht — er liefert
 * nur die gewaehlten Zutaten und die Optionswirkungen. Dadurch laesst sich
 * spaeter eine WebGL-Darstellung (React Three Fiber) als weiterer Renderer
 * registrieren, ohne die Konfigurationslogik anzufassen.
 */
export interface RendererProps {
  /** Nach Stapelebene (visual.z) sortiert. */
  ingredients: Ingredient[];
  effects: {
    sizeScale: number;
    spice: number;
    variants: string[];
  };
  /** Bezeichnung fuer Screenreader. */
  label: string;
}

export type FoodRenderer = (props: RendererProps) => React.JSX.Element;
