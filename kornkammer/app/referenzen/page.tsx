import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import Reveal from '@/components/motion/Reveal'
import Button from '@/components/ui/Button'
import FieldLine from '@/components/ui/FieldLine'
import { REFERENZEN, ABSATZWEGE } from '@/data/referenzen'
import { FARM } from '@/data/farm'

export const metadata: Metadata = {
  title: 'Referenzen',
  description:
    'Wohin die Ernte geht: Bäckereien in der Region, der Verkauf ab Hof und der Onlineshop.',
  alternates: { canonical: '/referenzen' },
}

export default function ReferenzenPage() {
  return (
    <>
      <PageHeader
        eyebrow={['Referenzen']}
        title="Wohin die Ernte geht"
        lead="Wer bei uns kauft, weiß, auf welchem Schlag es gewachsen ist. Das gilt für die Bäckerei genauso wie für den Einkauf am Freitag."
      />

      <section className="section bg-soil">
        <div className="shell">
          <div className="grid grid-cols-1 gap-[clamp(2rem,5vw,4rem)] lg:grid-cols-3">
            {ABSATZWEGE.map((weg, i) => (
              <Reveal key={weg.titel} delay={i * 0.06}>
                <div className="border-t border-[var(--hair)] pt-6">
                  <h2 className="text-h4 leading-[1.15]">{weg.titel}</h2>
                  <p className="mt-4 text-[color:var(--stone)]">{weg.text}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <FieldLine className="mt-[clamp(3.5rem,8vh,6rem)]" />

          {REFERENZEN.length === 0 ? (
            <Reveal className="mt-[clamp(3rem,7vh,5rem)]">
              <p className="u-mono inline-block border border-[var(--hair-strong)] px-4 py-3 text-[color:var(--clay)]">
                Die Liste der Abnehmer fehlt noch
              </p>
              <p className="measure-lead mt-8 text-lead">
                Hier sollen die Betriebe stehen, die unser Mehl, unsere Öle und unsere Kartoffeln
                weiterverarbeiten oder verkaufen.
              </p>
              <p className="measure mt-6 text-[color:var(--stone)]">
                Wir nennen sie erst, wenn die Angaben stimmen und die Zustimmung vorliegt. Fremde
                Firmennamen ins Netz zu stellen, ohne dass beides geklärt ist, wäre unsauber.
              </p>
              <div className="mt-8">
                <Button href="/kontakt">Anfragen als Abnehmer</Button>
              </div>
            </Reveal>
          ) : (
            <div className="mt-[clamp(3rem,7vh,5rem)] flex flex-col">
              {REFERENZEN.map((r) => (
                <Reveal key={r.name} as="article">
                  <div className="grid grid-cols-1 gap-4 border-t border-[var(--hair)] py-6 last:border-b sm:grid-cols-[1fr_auto]">
                    <div>
                      <h3 className="text-h4 leading-[1.15]">{r.name}</h3>
                      <p className="mt-2 text-[color:var(--stone)]">{r.was}</p>
                    </div>
                    <p className="u-mono text-[color:var(--stone)] sm:text-right">
                      {r.art}
                      <br />
                      {r.ort}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="pb-[var(--sec)] bg-soil">
        <div className="shell flex flex-wrap gap-4">
          <Button href={FARM.shop} external variant="ghost">
            Zum Onlineshop
          </Button>
          <Button href="/hofladen" variant="ghost">
            Direkt vom Hof
          </Button>
        </div>
      </section>
    </>
  )
}
