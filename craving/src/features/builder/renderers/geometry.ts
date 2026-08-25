import { between, randomFor, round } from "@/lib/rng";

/**
 * Verteilung der Zutatenstuecke.
 *
 * Deterministisch (Seed = Zutaten-ID): dieselbe Salami liegt bei jedem
 * Rendern an derselben Stelle, zwei verschiedene Zutaten liegen aber nie
 * gleich. Das ist die Grundlage dafuer, dass die Anordnung "zufaellig
 * gewachsen" aussieht, ohne bei jedem Rerender zu springen.
 */

export interface Placement {
  x: number;
  y: number;
  /** Grad */
  rot: number;
  /** Faktor auf die Grundgroesse des Stuecks */
  scale: number;
  /** 0–1, fuer gestaffelte Animation */
  order: number;
  /** leichte Farbabweichung, damit nicht alles identisch wirkt */
  shade: number;
}

const GOLDEN_ANGLE = 2.399963;

/**
 * Punkte auf einer Kreisflaeche (Pizza).
 * Sonnenblumen-Verteilung + Jitter = gleichmaessige Dichte ohne Raster-Optik.
 */
export function discPlacements(seed: string, count: number, radius: number): Placement[] {
  const rnd = randomFor(seed);
  const out: Placement[] = [];
  const offset = rnd() * Math.PI * 2;

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const r = radius * Math.sqrt(t) * between(rnd, 0.92, 1.02);
    const angle = i * GOLDEN_ANGLE + offset + between(rnd, -0.22, 0.22);
    out.push({
      x: round(Math.cos(angle) * r),
      y: round(Math.sin(angle) * r),
      rot: round(between(rnd, -180, 180), 1),
      scale: round(between(rnd, 0.86, 1.14), 3),
      order: round(rnd(), 4),
      shade: round(between(rnd, -0.12, 0.12), 3),
    });
  }
  // Nach Abstand zur Mitte mischen, damit die Animation von innen
  // nach aussen laeuft statt in Spiralform.
  return out.sort((a, b) => a.order - b.order);
}

export interface Band {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Woelbung der Fuellung nach oben (Doener). */
  arc?: number;
}

/** Punkte in einem (leicht gewoelbten) Band — Doener- und Croque-Fuellung. */
export function bandPlacements(seed: string, count: number, band: Band): Placement[] {
  const rnd = randomFor(seed);
  const out: Placement[] = [];
  const arc = band.arc ?? 0;

  for (let i = 0; i < count; i++) {
    const u = (i + between(rnd, 0.15, 0.85)) / count;
    const x = band.x + u * band.width;
    // Woelbung: in der Mitte liegt mehr Fuellung als an den Raendern.
    const lift = arc * Math.sin(Math.PI * u);
    const y = band.y + between(rnd, 0, band.height) - lift;
    out.push({
      x: round(x),
      y: round(y),
      rot: round(between(rnd, -35, 35), 1),
      scale: round(between(rnd, 0.82, 1.18), 3),
      order: round(rnd(), 4),
      shade: round(between(rnd, -0.14, 0.14), 3),
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

/** Unregelmaessiger Klecks — Basis fuer Sossen und Kaesedecken. */
export function blobPath(seed: string, radius: number, wobble = 0.09, points = 14): string {
  const rnd = randomFor(seed);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * (1 + between(rnd, -wobble, wobble));
    pts.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  return closedCatmullRom(pts);
}

/** Weiche geschlossene Kurve durch alle Punkte (Catmull-Rom -> Bezier). */
export function closedCatmullRom(points: Array<[number, number]>): string {
  const n = points.length;
  if (n < 3) return "";
  let d = `M ${points[0]![0].toFixed(2)} ${points[0]![1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d} Z`;
}

/**
 * Flache Scheibe mit welliger Kante — Kaese, Schinken, Sossenschicht im
 * Croque. Ein Rechteck waere Grafik, diese Kante ist Lebensmittel.
 */
export function slabPath(seed: string, width: number, height: number, wobble = 0.28): string {
  const rnd = randomFor(seed);
  const hw = width / 2;
  const hh = height / 2;
  const steps = 9;
  const pts: Array<[number, number]> = [];

  for (let i = 0; i <= steps; i++) {
    const x = -hw + (width * i) / steps;
    pts.push([round(x), round(-hh + between(rnd, -hh * wobble, hh * wobble))]);
  }
  pts.push([round(hw + hh * 0.7), 0]);
  for (let i = steps; i >= 0; i--) {
    const x = -hw + (width * i) / steps;
    pts.push([round(x), round(hh + between(rnd, -hh * wobble, hh * wobble))]);
  }
  pts.push([round(-hw - hh * 0.7), 0]);
  return closedCatmullRom(pts);
}

/** Sossen-Zickzack, wie mit der Flasche gezogen. */
export function drizzlePath(seed: string, band: Band, loops = 5): string {
  const rnd = randomFor(seed);
  const step = band.width / loops;
  let d = `M ${band.x.toFixed(2)} ${(band.y + band.height / 2).toFixed(2)}`;
  for (let i = 0; i < loops; i++) {
    const x1 = band.x + step * (i + 0.5);
    const x2 = band.x + step * (i + 1);
    const dir = i % 2 === 0 ? -1 : 1;
    const y1 = band.y + band.height / 2 + dir * between(rnd, band.height * 0.4, band.height * 0.8);
    const y2 = band.y + band.height / 2 + between(rnd, -4, 4);
    d += ` Q ${x1.toFixed(2)} ${y1.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  return d;
}

/** Hilfsfunktion: Farbe leicht aufhellen/abdunkeln (fuer `shade`). */
export function shift(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const adjust = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  return `#${[adjust(r), adjust(g), adjust(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
