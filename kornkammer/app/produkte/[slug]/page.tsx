import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import Reveal from '@/components/motion/Reveal'
import Parallax from '@/components/motion/Parallax'
import MediaFrame from '@/components/ui/MediaFrame'
import Button from '@/components/ui/Button'
import { PRODUCTS, productBySlug } from '@/data/products'
import { FARM, SITE } from '@/data/farm'

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const product = productBySlug(slug)
  if (!product) return {}
  return {
    title: product.name,
    description: product.line,
    alternates: { canonical: `/produkte/${product.slug}` },
    openGraph: { title: `${product.name} — ${FARM.name}`, description: product.line },
  }
}

export default async function ProduktPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = productBySlug(slug)
  if (!product) notFound()

  const index = PRODUCTS.findIndex((p) => p.slug === product.slug)
  const next = PRODUCTS[(index + 1) % PRODUCTS.length]

  /* Product-Auszeichnung ohne Preise und ohne Bewertungen: beides liegt
     nicht belegbar vor, und erfundene Angaben waeren hier besonders heikel. */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.line,
    brand: { '@type': 'Brand', name: product.slug === 'speiseoele' ? 'Ruhrtalgold' : FARM.name },
    url: `${SITE.url}/produkte/${product.slug}`,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PageHeader eyebrow={[product.eyebrow]} title={product.name} lead={product.line} />

      <section className="section bg-soil">
        <div className="shell">
          <div className="grid grid-cols-1 gap-[clamp(2rem,5vw,4.5rem)] lg:grid-cols-[1fr_0.85fr]">
            <Reveal className="flex flex-col gap-6">
              {product.body.map((paragraph) => (
                <p key={paragraph.slice(0, 24)} className="measure text-[color:var(--stone)]">
                  {paragraph}
                </p>
              ))}

              <ul className="mt-4 flex flex-col">
                {product.facts.map((fact) => (
                  <li key={fact} className="border-t border-[var(--hair)] py-4 last:border-b">
                    {fact}
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-wrap gap-4">
                <Button href="/hofladen">Direkt vom Hof</Button>
                <Button href={FARM.shop} external variant="ghost">
                  Im Onlineshop
                </Button>
              </div>
            </Reveal>

            <Parallax amount={0.05}>
              <MediaFrame
                src={product.image}
                alt={product.imageAlt}
                className="aspect-[4/5] w-full"
                sizes="(min-width: 1024px) 40vw, 90vw"
              />
            </Parallax>
          </div>
        </div>
      </section>

      {/* Weiter im Sortiment */}
      <section className="bg-soilDeep py-[clamp(3rem,8vh,6rem)]">
        <div className="shell">
          <Link href={`/produkte/${next.slug}`} className="group block">
            <p className="u-mono text-[color:var(--stone)]">Weiter</p>
            <p className="mt-4 text-h2 leading-[0.98] tracking-[-0.03em] transition-colors duration-300 group-hover:text-wheat">
              {next.name}
              <span
                aria-hidden
                className="ml-6 inline-block transition-transform duration-500 ease-[var(--ease-swift)] group-hover:translate-x-3"
              >
                →
              </span>
            </p>
          </Link>
        </div>
      </section>
    </>
  )
}
