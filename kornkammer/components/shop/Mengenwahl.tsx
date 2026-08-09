'use client'

/**
 * Der Mengensteller.
 *
 * Bewusst gross genug fuer den Daumen (44 px Zielflaeche) und mit einem
 * Zahlenfeld, das man auch tippen kann. Die Zahl steht in der Utility-Schrift
 * mit `tabular-nums`, damit sie beim Zaehlen nicht springt.
 */
export default function Mengenwahl({
  anzahl,
  onSetzen,
  label,
  klein = false,
}: {
  anzahl: number
  onSetzen: (n: number) => void
  /** Fuer Vorlesesoftware: um welchen Artikel geht es? */
  label: string
  klein?: boolean
}) {
  const feld = klein ? 'h-10 w-10' : 'h-11 w-11'

  return (
    <div className="inline-flex items-center border border-[var(--hair-strong)]">
      <button
        type="button"
        onClick={() => onSetzen(anzahl - 1)}
        aria-label={`${label}: eins weniger`}
        className={`${feld} grid place-items-center text-lg leading-none transition-colors duration-200 hover:bg-[var(--hair)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--wheat)]`}
      >
        <span aria-hidden>−</span>
      </button>

      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        value={anzahl}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10)
          onSetzen(Number.isNaN(n) ? 0 : n)
        }}
        aria-label={`${label}: Anzahl`}
        className="u-mono h-11 w-12 border-x border-[var(--hair-strong)] bg-transparent text-center text-current [appearance:textfield] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--wheat)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.08em' }}
      />

      <button
        type="button"
        onClick={() => onSetzen(anzahl + 1)}
        aria-label={`${label}: eins mehr`}
        className={`${feld} grid place-items-center text-lg leading-none transition-colors duration-200 hover:bg-[var(--hair)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--wheat)]`}
      >
        <span aria-hidden>+</span>
      </button>
    </div>
  )
}
