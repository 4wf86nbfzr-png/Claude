/**
 * Utility-Zeile ueber einer Ueberschrift.
 * Mehrere Angaben werden durch eine haardünne senkrechte Linie getrennt,
 * niemals durch einen Strich oder Punkt.
 */
export default function Eyebrow({
  items,
  className,
  tone = 'stone',
}: {
  items: string | string[]
  className?: string
  tone?: 'stone' | 'wheat'
}) {
  const list = Array.isArray(items) ? items : [items]
  const color = tone === 'wheat' ? 'text-wheat' : 'text-[color:var(--stone)]'

  return (
    <p className={`u-mono flex flex-wrap items-center gap-x-4 gap-y-2 ${color} ${className ?? ''}`}>
      {list.map((item, i) => (
        <span key={item} className="flex items-center gap-4">
          {i > 0 && <span aria-hidden className="h-3 w-px bg-[var(--hair-strong)]" />}
          <span>{item}</span>
        </span>
      ))}
    </p>
  )
}
