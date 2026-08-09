'use client'

import Link from 'next/link'
import HorizontalScroll from '@/components/motion/HorizontalScroll'
import MediaFrame from '@/components/ui/MediaFrame'
import Eyebrow from '@/components/ui/Eyebrow'
import { PRODUCTS } from '@/data/products'

/**
 * Die Produktwelt laeuft horizontal — die einzige Stelle der Seite, an der
 * vertikale Eingabe in seitliche Bewegung uebersetzt wird.
 *
 * Keine Produktkarten: jeder Auftritt fuellt fast die ganze Hoehe, der Name
 * steht gross im Bild, der Rest erscheint erst beim Herangehen.
 */
export default function ProductWorld() {
  return (
    <section aria-labelledby="produkte-titel" className="relative bg-soilDeep">
      <div className="shell pt-[var(--sec)]">
        <Eyebrow items={['Produktwelt']} tone="wheat" />
        <h2
          id="produkte-titel"
          className="optical mt-8 max-w-[14ch] text-h2 leading-[0.98] tracking-[-0.03em]"
        >
          Was hier wächst, verlässt den Hof als fertiges Produkt.
        </h2>
        <p className="u-mono mt-8 text-[color:var(--stone)]">Seitwärts scrollen</p>
      </div>

      <HorizontalScroll className="mt-12 lg:h-[100svh] lg:mt-0">
        <div className="flex items-center gap-[clamp(1rem,3vw,3rem)] px-[var(--gutter)] lg:h-[100svh]">
          {PRODUCTS.map((product) => (
            <article
              key={product.slug}
              className="group relative w-[78vw] shrink-0 sm:w-[58vw] lg:w-[42vw]"
              style={{ scrollSnapAlign: 'center' }}
            >
              <Link href={`/produkte/${product.slug}`} className="block">
                {/* Hoehe an den Viewport gebunden, nicht ans Seitenverhaeltnis:
                    sonst schiebt das Bild die Beschriftung aus dem Bild. */}
                <div className="relative h-[46svh] overflow-hidden max-lg:aspect-[4/5] max-lg:h-auto">
                  <MediaFrame
                    src={product.image}
                    alt={product.imageAlt}
                    className="h-full w-full transition-transform duration-[900ms] ease-[var(--ease-soft)] group-hover:scale-[1.04]"
                    sizes="(min-width: 1024px) 42vw, 78vw"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background:
                        'linear-gradient(to top, rgba(13,10,6,0.86) 0%, rgba(13,10,6,0) 62%)',
                    }}
                  />
                </div>

                <div className="mt-6 flex items-baseline justify-between gap-6">
                  <div>
                    <p className="u-mono text-[color:var(--stone)]">{product.eyebrow}</p>
                    <h3 className="mt-3 text-h3 leading-[1.02]">{product.name}</h3>
                  </div>
                  <span
                    aria-hidden
                    className="translate-x-0 text-h4 text-wheat transition-transform duration-500 ease-[var(--ease-swift)] group-hover:translate-x-2"
                  >
                    →
                  </span>
                </div>

                <p className="mt-4 max-w-[38ch] text-[color:var(--stone)]">{product.line}</p>
              </Link>
            </article>
          ))}

          {/* Abschluss des Laufs: fuehrt in die Uebersicht */}
          <div className="flex w-[70vw] shrink-0 items-center lg:w-[34vw]">
            <div>
              <p className="text-h3 u-italic max-w-[14ch]">Alles in Ruhe ansehen.</p>
              <Link
                href="/produkte"
                className="u-mono mt-8 inline-flex items-center gap-3 border-b border-[var(--hair-strong)] pb-2 text-wheat transition-colors hover:border-wheat"
              >
                Zur Übersicht
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </HorizontalScroll>
    </section>
  )
}
