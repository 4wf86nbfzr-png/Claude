import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import Reveal from '@/components/motion/Reveal'
import MediaFrame from '@/components/ui/MediaFrame'
import { TEAM, TEAM_UNVOLLSTAENDIG } from '@/data/team'

export const metadata: Metadata = {
  title: 'Team',
  description:
    'Die Menschen hinter Team Kornkammer: Betriebsleitung, Verarbeitung, Hofverkauf und Technik.',
  alternates: { canonical: '/team' },
}

export default function TeamPage() {
  return (
    <>
      <PageHeader
        eyebrow={['Team']}
        title="Die Leute hinter dem Korn"
        lead="Ein Hof dieser Größe funktioniert nur, wenn jede und jeder weiß, was in der eigenen Woche ansteht."
      />

      {TEAM_UNVOLLSTAENDIG && (
        <div className="shell">
          <p className="u-mono inline-block border border-[var(--hair-strong)] px-4 py-3 text-[color:var(--clay)]">
            Funktionen und weitere Mitglieder sind noch einzusetzen
          </p>
        </div>
      )}

      <section className="section bg-soil">
        <div className="shell flex flex-col">
          {TEAM.map((member, i) => (
            <Reveal key={member.id} as="article" delay={i * 0.04}>
              <div className="grid grid-cols-1 items-center gap-[clamp(1.5rem,4vw,4rem)] border-t border-[var(--hair)] py-[clamp(2rem,5vh,3.5rem)] last:border-b sm:grid-cols-[0.4fr_1fr]">
                <MediaFrame
                  src={member.image ?? `/images/team/${member.id}.webp`}
                  alt={member.imageAlt ?? `Porträt: ${member.name}`}
                  className="aspect-[3/4] w-full max-w-[18rem]"
                  sizes="(min-width: 640px) 28vw, 90vw"
                />
                <div>
                  <p className="u-mono text-[color:var(--clay)]">
                    {member.role || 'Funktion folgt'}
                  </p>
                  <h2 className="mt-4 text-h2 leading-[1] tracking-[-0.03em]">{member.name}</h2>
                  {member.responsibility && (
                    <p className="measure mt-5 text-[color:var(--stone)]">
                      {member.responsibility}
                    </p>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  )
}
