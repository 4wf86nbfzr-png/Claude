/**
 * Gemeinsame Textur-Filter.
 *
 * Der Unterschied zwischen "Illustration" und "Essen" ist Unregelmaessigkeit:
 * eine gleichmaessige Flaeche liest sich als Grafik, eine leicht koernige
 * als Material. feTurbulence liefert diese Koernung ohne Bilddatei.
 * Die Filter sind statisch (keine animierten Parameter) und werden pro
 * Renderer nur einmal angelegt.
 */
export function TextureDefs({ prefix }: { prefix: string }) {
  return (
    <>
      {/* Feine Koernung fuer Kaese, Teig, Brot */}
      <filter id={`${prefix}-grain`} x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="4" seed="17" result="n" />
        <feColorMatrix in="n" type="saturate" values="0" />
      </filter>
      {/* Grobe Wolken fuer Backfarbe / Flecken */}
      <filter id={`${prefix}-clouds`} x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="29" result="n" />
        <feColorMatrix in="n" type="saturate" values="0" />
      </filter>
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
      <rect {...box} filter={`url(#${prefix}-${variant})`} />
    </g>
  );
}
