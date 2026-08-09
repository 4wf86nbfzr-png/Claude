/**
 * Die Siegelzeile.
 *
 * Bioland steht als Bildmarke, weil das Zeichen selbst die Aussage traegt —
 * ein gruenes Quadrat erkennt man im Regal wieder, das Wort allein nicht.
 * Die uebrigen Angaben bleiben Text: fuer EU Bio und GlobalGAP liegt uns
 * keine Bilddatei vor, und ein nachgebautes Siegel waere hier falsch.
 */
export default function Siegel({
  className,
  tone = 'paper',
  gross = false,
}: {
  className?: string
  tone?: 'paper' | 'stone'
  gross?: boolean
}) {
  const farbe = tone === 'paper' ? 'text-[color:var(--paper)]' : 'text-[color:var(--stone)]'
  const kante = gross ? 44 : 34

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-3 ${className ?? ''}`}>
      <img
        src="/logo/bioland.webp"
        alt="Bioland"
        width={kante}
        height={kante}
        loading="eager"
        decoding="async"
        style={{ width: kante, height: kante }}
      />
      <span aria-hidden className="h-4 w-px bg-[var(--hair-strong)]" />
      <span className={`u-mono ${farbe}`}>EU Bio</span>
      <span aria-hidden className="h-4 w-px bg-[var(--hair-strong)]" />
      <span className={`u-mono ${farbe}`}>GlobalGAP</span>
    </div>
  )
}
