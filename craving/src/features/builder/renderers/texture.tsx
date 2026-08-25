/**
 * Gemeinsame Texturen.
 *
 * Der Unterschied zwischen "Illustration" und "Essen" ist Unregelmaessigkeit:
 * eine gleichmaessige Flaeche liest sich als Grafik, eine leicht koernige
 * als Material. feTurbulence liefert diese Koernung ohne Bilddatei.
 *
 * Wichtig fuer die Geschwindigkeit: das Rauschen wird EINMAL auf eine
 * kleine Kachel gerechnet und dann als Muster wiederholt. Ein Filter ueber
 * die volle Produktflaeche kostet auf grossen Bildschirmen ein Vielfaches
 * — sichtbar in der Zeit bis zum groessten Bildausschnitt (LCP).
 */
export function TextureDefs({ prefix }: { prefix: string }) {
  return (
    <>
      <filter id={`${prefix}-grain-f`} x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="17" result="n" />
        <feColorMatrix in="n" type="saturate" values="0" />
      </filter>
      <filter id={`${prefix}-clouds-f`} x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="29" result="n" />
        <feColorMatrix in="n" type="saturate" values="0" />
      </filter>

      {/* Kacheln: feine Koernung 48 px, grobe Wolken 220 px */}
      <pattern id={`${prefix}-grain`} width="48" height="48" patternUnits="userSpaceOnUse">
        <rect width="48" height="48" filter={`url(#${prefix}-grain-f)`} />
      </pattern>
      <pattern id={`${prefix}-clouds`} width="220" height="220" patternUnits="userSpaceOnUse">
        <rect width="220" height="220" filter={`url(#${prefix}-clouds-f)`} />
      </pattern>

      {/* Weiche Kantenstoerung fuer Teigraender */}
      <filter id={`${prefix}-edge`} x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.024" numOctaves="3" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="8" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </>
  );
}

/** Koernung ueber eine Flaeche legen — immer geclippt aufrufen. */
export function GrainOverlay({
  prefix,
  box,
  opacity = 0.16,
  variant = "grain",
}: {
  prefix: string;
  box: { x: number; y: number; width: number; height: number };
  opacity?: number;
  variant?: "grain" | "clouds";
}) {
  return (
    <g style={{ mixBlendMode: "overlay" }} opacity={opacity} aria-hidden>
      <rect {...box} fill={`url(#${prefix}-${variant})`} />
    </g>
  );
}
