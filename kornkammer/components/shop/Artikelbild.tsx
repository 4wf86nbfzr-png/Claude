'use client'

import { useEffect, useRef, useState } from 'react'

const PLATZHALTER = '/images/platzhalter.webp'

/**
 * Bild eines Artikels.
 *
 * Gleiche Regel wie im MediaFrame: fehlt die Datei, wird die Quelle am selben
 * `img` getauscht statt das Element auszuwechseln. Sonst blitzt das kaputte
 * Bildsymbol des Browsers auf, und das sieht nach Fehler aus statt nach
 * Absicht. Welches Motiv vorgesehen ist, steht dann sichtbar drin.
 */
export default function Artikelbild({
  src,
  alt,
  className,
  hinweis = true,
}: {
  src: string
  alt: string
  className?: string
  /** Im kleinen Vorschaubild der Schublade waere die Beschriftung nur Rauschen. */
  hinweis?: boolean
}) {
  const ref = useRef<HTMLImageElement>(null)
  const [fehlt, setFehlt] = useState(false)

  useEffect(() => {
    const img = ref.current
    if (img && img.complete && img.naturalWidth === 0) setFehlt(true)
  }, [])

  return (
    <>
      <img
        ref={ref}
        src={fehlt ? PLATZHALTER : src}
        alt={fehlt ? `Platzhalter. Vorgesehenes Motiv: ${alt}` : alt}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (!fehlt) setFehlt(true)
        }}
        className={className}
        style={{ color: 'transparent' }}
      />
      {fehlt && hinweis && (
        <span className="u-mono pointer-events-none absolute inset-x-0 bottom-0 block bg-gradient-to-t from-[rgba(13,10,6,0.9)] to-transparent p-3 pt-8 text-[color:var(--stone)]">
          {alt}
        </span>
      )}
    </>
  )
}
