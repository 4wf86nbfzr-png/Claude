import Link from 'next/link'
import { FARM } from '@/data/farm'
import SplitLines from '@/components/motion/SplitLines'
import FieldLine from '@/components/ui/FieldLine'

/**
 * Der Footer ist ein Gestaltungselement, kein Restposten.
 * Das Gruendungsjahr steht hier als Fliesstext — nie als Schmuckziffer.
 */
export default function Footer() {
  return (
    <footer className="relative bg-soilDeep pt-[clamp(5rem,12vh,9rem)]">
      <div className="shell">
        <SplitLines
          as="p"
          className="optical font-display text-colossal uppercase leading-[0.84] tracking-[-0.035em]"
        >
          Ein Stück Natur aus dem Revier
        </SplitLines>

        <FieldLine className="mt-14" />

        <div className="grid grid-cols-1 gap-10 pb-10 pt-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="u-mono text-[color:var(--stone)]">Hof</p>
            <address className="mt-4 not-italic leading-relaxed">
              {FARM.legalName}
              <br />
              {FARM.address.street}
              <br />
              {FARM.address.zip}&nbsp;{FARM.address.city}
            </address>
          </div>

          <div>
            <p className="u-mono text-[color:var(--stone)]">Kontakt</p>
            <ul className="mt-4 flex flex-col gap-2">
              <li>
                <a href={FARM.phone.href} className="hover:text-wheat">
                  {FARM.phone.display}
                </a>
              </li>
              <li>
                <a href={FARM.email.href} className="hover:text-wheat">
                  {FARM.email.display}
                </a>
              </li>
              <li>
                <a
                  href={FARM.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-wheat"
                >
                  Instagram ↗
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="u-mono text-[color:var(--stone)]">Seiten</p>
            <ul className="mt-4 flex flex-col gap-2">
              <li>
                <Link href="/hof" className="hover:text-wheat">
                  Der Hof
                </Link>
              </li>
              <li>
                <Link href="/produkte" className="hover:text-wheat">
                  Produkte
                </Link>
              </li>
              <li>
                <Link href="/hofladen" className="hover:text-wheat">
                  Direkt vom Hof
                </Link>
              </li>
              <li>
                <Link href="/bio" className="hover:text-wheat">
                  Bio verstehen
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="u-mono text-[color:var(--stone)]">Kaufen</p>
            <p className="mt-4 max-w-[26ch] text-[color:var(--stone)]">
              Der Onlineshop liegt auf einer eigenen Plattform. Sie verlassen dabei diese Seite.
            </p>
            <a
              href={FARM.shop}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-wheat hover:text-wheatSoft"
            >
              Zum Onlineshop
              <span aria-hidden>↗</span>
            </a>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 border-t border-[var(--hair)] py-7 text-[color:var(--stone)] sm:flex-row sm:items-center">
          <p className="max-w-[52ch] text-[0.9rem]">
            {FARM.legalName} bewirtschaftet die Flächen seit {FARM.since} nach den Richtlinien des
            Bioland Verbands.
          </p>
          <ul className="flex items-center gap-6">
            <li>
              <Link href="/impressum" className="u-mono hover:text-paper">
                Impressum
              </Link>
            </li>
            <li>
              <Link href="/datenschutz" className="u-mono hover:text-paper">
                Datenschutz
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
