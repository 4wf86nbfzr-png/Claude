import type { LayerShape } from "@/types/domain";
import { shift } from "./geometry";

/**
 * Die einzelnen Zutatenstuecke als SVG.
 *
 * Alle Formen sind auf den Radius 1 normiert und werden ueber `transform`
 * skaliert — so kostet eine Groessenaenderung keinen neuen Pfad.
 * Farbverlaeufe liegen einmal pro Zutat in <defs> (PieceDefs), nicht pro
 * Stueck: bei 80 Salamischeiben macht das den Unterschied.
 */

export function PieceDefs({ id, palette }: { id: string; palette: string[] }) {
  const [base = "#ccc", dark = "#888", light = "#fff", speck] = palette;
  return (
    <>
      <radialGradient id={`g-${id}`} cx="34%" cy="28%" r="78%">
        <stop offset="0%" stopColor={light} />
        <stop offset="46%" stopColor={base} />
        <stop offset="100%" stopColor={dark} />
      </radialGradient>
      <linearGradient id={`gl-${id}`} x1="0%" y1="0%" x2="18%" y2="100%">
        <stop offset="0%" stopColor={light} />
        <stop offset="42%" stopColor={base} />
        <stop offset="100%" stopColor={shift(dark, -0.08)} />
      </linearGradient>
      {speck && (
        <radialGradient id={`gs-${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor={shift(speck, 0.2)} />
          <stop offset="100%" stopColor={speck} />
        </radialGradient>
      )}
    </>
  );
}

interface PieceProps {
  shape: LayerShape;
  id: string;
  palette: string[];
  /**
   * Fuellung der Hauptflaeche. Ist eine Fototextur hinterlegt, kommt hier
   * deren Muster-Referenz an — Form, Kante und Glanz bleiben gezeichnet.
   */
  fill?: string;
}

/** Runde Scheibe: Salami, Tomate, Gurke, Champignon. */
function Slice({ id, palette, fill }: PieceProps) {
  const speck = palette[3];
  const body = fill ?? `url(#g-${id})`;
  return (
    <g>
      <ellipse cx="0.06" cy="0.12" rx="1" ry="0.98" fill={palette[1]} opacity="0.34" />
      <circle r="1" fill={body} />
      <circle r="1" fill="none" stroke={palette[1]} strokeWidth="0.07" opacity={fill ? 0.28 : 0.75} />
      {speck && !fill && (
        <g fill={`url(#gs-${id})`} opacity="0.9">
          <circle cx="-0.36" cy="-0.22" r="0.15" />
          <circle cx="0.28" cy="-0.4" r="0.11" />
          <circle cx="0.42" cy="0.22" r="0.16" />
          <circle cx="-0.14" cy="0.44" r="0.12" />
          <circle cx="0.02" cy="0.02" r="0.09" />
        </g>
      )}
      <ellipse cx="-0.3" cy="-0.36" rx="0.34" ry="0.22" fill="#fff" opacity={fill ? 0.07 : 0.16} transform="rotate(-24)" />
    </g>
  );
}

/** Ring: Zwiebel, Jalapeno, Olive, Paprika. Mitte bleibt durchsichtig. */
function Ring({ id, palette, fill }: PieceProps) {
  const d =
    "M -1 0 A 1 1 0 1 0 1 0 A 1 1 0 1 0 -1 0 Z " +
    "M -0.52 0 A 0.52 0.52 0 1 1 0.52 0 A 0.52 0.52 0 1 1 -0.52 0 Z";
  return (
    <g>
      <path d={d} fillRule="evenodd" fill={palette[1]} opacity="0.35" transform="translate(0.05 0.12)" />
      <path d={d} fillRule="evenodd" fill={fill ?? `url(#g-${id})`} />
      <path
        d="M -0.86 -0.34 A 0.92 0.92 0 0 1 -0.1 -0.9"
        fill="none"
        stroke="#fff"
        strokeWidth="0.12"
        strokeLinecap="round"
        opacity="0.18"
      />
    </g>
  );
}

/** Geschnittener Salat, Kraut, Fleischstreifen — leicht gedrehte Sichel. */
function Shred({ id, palette, fill }: PieceProps) {
  return (
    <g>
      <path
        d="M -1 0.06 Q -0.2 -0.62 1 -0.1 Q 0.1 0.42 -1 0.06 Z"
        fill={palette[1]}
        opacity="0.3"
        transform="translate(0.03 0.1)"
      />
      <path d="M -1 0.06 Q -0.2 -0.62 1 -0.1 Q 0.1 0.42 -1 0.06 Z" fill={fill ?? `url(#gl-${id})`} />
      <path
        d="M -0.72 -0.02 Q -0.1 -0.4 0.74 -0.12"
        fill="none"
        stroke="#fff"
        strokeWidth="0.08"
        strokeLinecap="round"
        opacity="0.3"
      />
    </g>
  );
}

/** Wuerfel/Korn: Mais, Feta, Haehnchenwuerfel. */
function Dice({ id, palette, fill }: PieceProps) {
  return (
    <g>
      <rect x="-0.92" y="-0.78" width="1.9" height="1.7" rx="0.5" fill={palette[1]} opacity="0.32" transform="translate(0.06 0.14)" />
      <rect x="-1" y="-0.86" width="2" height="1.72" rx="0.55" fill={fill ?? `url(#g-${id})`} />
      <ellipse cx="-0.28" cy="-0.34" rx="0.42" ry="0.26" fill="#fff" opacity="0.22" transform="rotate(-18)" />
    </g>
  );
}

/** Blatt: Rucola, Spinat. */
function Leaf({ id, palette, fill }: PieceProps) {
  return (
    <g>
      <path d="M -1 0 Q -0.2 -0.86 1 -0.12 Q 0 0.86 -1 0 Z" fill={palette[1]} opacity="0.3" transform="translate(0.04 0.12)" />
      <path d="M -1 0 Q -0.2 -0.86 1 -0.12 Q 0 0.86 -1 0 Z" fill={fill ?? `url(#gl-${id})`} />
      <path d="M -0.86 -0.02 Q 0 -0.1 0.9 -0.12" fill="none" stroke={palette[2]} strokeWidth="0.07" opacity="0.6" />
    </g>
  );
}

/** Streifen: Fleisch vom Spiess, Bacon, Schinken. */
function Strip({ id, palette, fill }: PieceProps) {
  const fat = palette[3];
  return (
    <g>
      <path
        d="M -1 -0.3 Q -0.3 -0.52 0.2 -0.28 Q 0.7 -0.06 1 -0.24 L 1 0.28 Q 0.6 0.5 0.1 0.28 Q -0.4 0.06 -1 0.3 Z"
        fill={palette[1]}
        opacity="0.34"
        transform="translate(0.04 0.14)"
      />
      <path
        d="M -1 -0.3 Q -0.3 -0.52 0.2 -0.28 Q 0.7 -0.06 1 -0.24 L 1 0.28 Q 0.6 0.5 0.1 0.28 Q -0.4 0.06 -1 0.3 Z"
        fill={fill ?? `url(#gl-${id})`}
      />
      {fat && (
        <path
          d="M -0.9 -0.12 Q -0.3 -0.32 0.2 -0.1 Q 0.7 0.1 0.95 -0.05"
          fill="none"
          stroke={fat}
          strokeWidth="0.1"
          strokeLinecap="round"
          opacity="0.55"
        />
      )}
      <path
        d="M -0.8 0.12 Q -0.2 -0.06 0.4 0.14"
        fill="none"
        stroke="#fff"
        strokeWidth="0.07"
        strokeLinecap="round"
        opacity="0.18"
      />
    </g>
  );
}

const RENDERERS: Partial<Record<LayerShape, (p: PieceProps) => React.JSX.Element>> = {
  slice: Slice,
  ring: Ring,
  shred: Shred,
  dice: Dice,
  leaf: Leaf,
  strip: Strip,
};

/** Grundgroesse je Form in Nutzer-Einheiten des jeweiligen Renderers. */
export const PIECE_SIZE: Record<LayerShape, number> = {
  base: 1,
  sauce: 1,
  spread: 1,
  sheet: 1,
  slice: 15,
  ring: 12,
  shred: 13,
  dice: 6,
  leaf: 12,
  strip: 17,
};

export function Piece(props: PieceProps) {
  const Component = RENDERERS[props.shape];
  return Component ? <Component {...props} /> : null;
}

export function hasPieceRenderer(shape: LayerShape): boolean {
  return shape in RENDERERS;
}
