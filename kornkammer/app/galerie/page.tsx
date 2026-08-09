import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import Reveal from '@/components/motion/Reveal'
import Parallax from '@/components/motion/Parallax'
import MediaFrame from '@/components/ui/MediaFrame'

export const metadata: Metadata = {
  title: 'Galerie',
  description: 'Bilder vom Hof, von den Feldern und aus der Verarbeitung.',
  alternates: { canonical: '/galerie' },
}

/**
 * Ein bewusst unregelmaessiges Raster: die Bilder haben unterschiedliche
 * Formate und Hoehen, damit die Seite nicht wie eine Bildergalerie aus dem
 * Baukasten aussieht.
 */
const BILDER = [
  { src: '/images/galerie/feld-daemmerung.jpg', alt: 'Feldarbeit in der Dämmerung', span: 'lg:col-span-7', ratio: 'aspect-[16/10]', shift: 0.06 },
  { src: '/images/galerie/aehren.jpg', alt: 'Ähren kurz vor der Ernte', span: 'lg:col-span-5 lg:mt-24', ratio: 'aspect-[3/4]', shift: -0.05 },
  { src: '/images/galerie/muehle.jpg', alt: 'Mehl läuft aus der Mühle', span: 'lg:col-span-5', ratio: 'aspect-[4/5]', shift: 0.04 },
  { src: '/images/galerie/hofzufahrt.jpg', alt: 'Die Zufahrt zur Hofstelle', span: 'lg:col-span-7 lg:mt-16', ratio: 'aspect-[16/11]', shift: -0.06 },
  { src: '/images/galerie/kartoffelernte.jpg', alt: 'Kartoffelernte am Nachmittag', span: 'lg:col-span-8', ratio: 'aspect-[16/9]', shift: 0.05 },
  { src: '/images/galerie/senf.jpg', alt: 'Senfgläser aus der eigenen Manufaktur', span: 'lg:col-span-4 lg:mt-20', ratio: 'aspect-[3/4]', shift: -0.04 },
]

export default function GaleriePage() {
  return (
    <>
      <PageHeader
        eyebrow={['Galerie']}
        title="Ein Jahr auf dem Hof"
        lead="Aufnahmen aus den Wochen, in denen alles gleichzeitig passiert."
      />

      <section className="section bg-soil">
        <div className="shell grid grid-cols-1 gap-[clamp(1.5rem,4vw,3rem)] lg:grid-cols-12">
          {BILDER.map((bild) => (
            <Reveal key={bild.src} as="figure" className={bild.span}>
              <Parallax amount={bild.shift}>
                <MediaFrame
                  src={bild.src}
                  alt={bild.alt}
                  className={`w-full ${bild.ratio}`}
                  sizes="(min-width: 1024px) 55vw, 92vw"
                />
              </Parallax>
              <figcaption className="u-mono mt-4 text-[color:var(--stone)]">{bild.alt}</figcaption>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  )
}
