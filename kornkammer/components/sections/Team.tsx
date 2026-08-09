import Link from 'next/link'
import SplitLines from '@/components/motion/SplitLines'
import Reveal from '@/components/motion/Reveal'
import MediaFrame from '@/components/ui/MediaFrame'
import Eyebrow from '@/components/ui/Eyebrow'
import { TEAM, TEAM_UNVOLLSTAENDIG } from '@/data/team'

/**
 * Menschen grossflaechig, keine Passfoto-Karten.
 * Name, Funktion und Verantwortung erscheinen beim Scrollen, sehr reduziert.
 */
export default function Team() {
  return (
    <section className="section bg-soilDeep" aria-labelledby="team-titel">
      <div className="shell">
        <Eyebrow items={['Team']} />
        <SplitLines
          as="h2"
          id="team-titel"
          className="optical mt-8 max-w-[20ch] text-h2 leading-[0.98] tracking-[-0.03em]"
        >
          Hinter jedem Sack Mehl steht jemand, der im Februar bei Regen auf dem Feld war.
        </SplitLines>

        {TEAM_UNVOLLSTAENDIG && (
          <p className="u-mono mt-10 inline-block border border-[var(--hair-strong)] px-3 py-2 text-[color:var(--clay)]">
            Funktionen und weitere Mitglieder folgen
          </p>
        )}

        <div className="mt-14 grid grid-cols-1 gap-x-[clamp(1rem,3vw,2.5rem)] gap-y-[clamp(2.5rem,6vh,5rem)] sm:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((member, i) => (
            <Reveal key={member.id} delay={i * 0.05} as="article">
              <MediaFrame
                src={member.image ?? `/images/team/${member.id}.webp`}
                alt={member.imageAlt ?? `${member.name} auf dem Hof`}
                className="aspect-[3/4] w-full"
                sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
              />
              <p className="mt-5 text-h4 leading-[1.1]">{member.name}</p>
              {member.role ? (
                <p className="u-mono mt-3 text-wheat">{member.role}</p>
              ) : (
                <p className="u-mono mt-3 text-[color:var(--clay)]">Funktion folgt</p>
              )}
              {member.responsibility && (
                <p className="mt-3 text-[color:var(--stone)]">{member.responsibility}</p>
              )}
            </Reveal>
          ))}
        </div>

        <Link
          href="/team"
          className="u-mono mt-14 inline-flex items-center gap-3 border-b border-[var(--hair-strong)] pb-2 text-wheat transition-colors hover:border-wheat"
        >
          Das ganze Team
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  )
}
