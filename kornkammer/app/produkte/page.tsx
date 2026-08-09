import type { Metadata } from 'next'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import Reveal from '@/components/motion/Reveal'
import MediaFrame from '@/components/ui/MediaFrame'
import { PRODUCTS } from '@/data/products'

export const metadata: Metadata = {
  title: 'Produkte',
  description:
    'Kartoffeln, Getreide und Mehle, Speiseöle als Ruhrtalgold, Nudeln und Senf aus eigener Manufaktur. Alles aus eigenem Anbau in Bioland Qualität.',
  alternates: { canonical: '/produkte' },
}

export default function ProduktePage() {
  return (
    <>
      <PageHeader
        eyebrow={['Produkte']}
        title="Aus eigenem Anbau"
        lead="Was hier wächst, verlässt den Hof zunehmend als fertiges Produkt. Damit bleibt nachvollziehbar, wo es herkommt."
      />

      <section className="bg-soil pb-[var(--sec)]">
        <div className="shell flex flex-col">
          {PRODUCTS.map((product, i) => (
            <Reveal key={product.slug} as="article">
              <Link
                href={`/produkte/${product.slug}`}
                className="group grid grid-cols-1 items-center gap-[clamp(1.5rem,4vw,4rem)] border-t border-[var(--hair)] py-[clamp(2rem,5vh,4rem)] last:border-b lg:grid-cols-[0.45fr_1fr]"
                style={{ direction: i % 2 === 1 ? 'rtl' : 'ltr' }}
              >
                <div style={{ direction: 'ltr' }}>
                  <MediaFrame
                    src={product.image}
                    alt={product.imageAlt}
                    className="aspect-[4/3] w-full transition-transform duration-[900ms] ease-[var(--ease-soft)] group-hover:scale-[1.03]"
                    sizes="(min-width: 1024px) 30vw, 90vw"
                  />
                </div>

                <div style={{ direction: 'ltr' }}>
                  <p className="u-mono text-[color:var(--stone)]">{product.eyebrow}</p>
                  <h2 className="mt-4 text-h2 leading-[0.98] tracking-[-0.03em] transition-colors duration-300 group-hover:text-wheat">
                    {product.name}
                  </h2>
                  <p className="measure-lead mt-5 text-lead">{product.line}</p>
                  <span className="u-mono mt-7 inline-flex items-center gap-3 text-wheat">
                    Ansehen
                    <span
                      aria-hidden
                      className="transition-transform duration-500 ease-[var(--ease-swift)] group-hover:translate-x-2"
                    >
                      →
                    </span>
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  )
}
