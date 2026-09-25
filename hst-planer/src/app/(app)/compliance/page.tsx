import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { complianceStand, gesamtsatz } from '@/lib/compliance/status';
import { Hinweis, Karte, Leer, Seitenkopf } from '@/components/ui';
import { Icon } from '@/components/icons';

export const metadata: Metadata = { title: 'HST Compliance' };
export const dynamic = 'force-dynamic';

const STUFE_FARBE = { offen: 'rot', in_arbeit: 'gelb', erledigt: 'gruen' } as const;
const STUFE_WORT = { offen: 'offen', in_arbeit: 'in Arbeit', erledigt: 'nichts offen' } as const;

/**
 * HST Compliance – Übersicht (SecPlan 22, 23 und 30).
 *
 * Bewusst ohne Erfüllungsquote. „98 % DSGVO-konform" wäre eine Zahl ohne
 * Gegenstand, und sie würde genau das verdecken, worauf es ankommt: die
 * zwei Prozent. Stattdessen steht je Bereich, was geführt wird und was
 * konkret offen ist.
 *
 * Und: dieses System unterscheidet TECHNISCH UMGESETZT von RECHTLICH
 * GEPRÜFT. Das erste kann es feststellen, das zweite nur abbilden.
 */
export default async function Compliance() {
  const user = await seite('compliance.view');
  const punkte = await complianceStand();

  const bereiche = [
    { href: '/compliance/datenschutz', label: 'Datenschutz', icon: 'shield', text: 'Verarbeitungstätigkeiten und Betroffenenanfragen' },
    { href: '/compliance/tom', label: 'TOM', icon: 'lock', text: 'Technische und organisatorische Maßnahmen, Art. 32' },
    { href: '/compliance/avv', label: 'AVV', icon: 'handshake', text: 'Auftragsverarbeiter und Drittlandtransfers, Art. 28' },
    { href: '/compliance/loeschfristen', label: 'Löschfristen', icon: 'clock', text: 'Löschkonzept je Datenkategorie' },
    { href: '/compliance/audit-log', label: 'Audit-Log', icon: 'eye', text: 'Wer hat was wann getan', recht: 'audit.view' as const },
    { href: '/compliance/vorfaelle', label: 'Datenschutzvorfälle', icon: 'warn', text: 'Meldewege nach Art. 33/34', recht: 'compliance.breaches' as const },
    { href: '/compliance/dsfa', label: 'DSFA', icon: 'scale', text: 'Folgenabschätzung nach Art. 35' },
    { href: '/compliance/dokumentation', label: 'Dokumentation', icon: 'book', text: 'Richtlinien, Einwilligungen, Nachweise' },
    { href: '/compliance/sicherheitscheck', label: 'Sicherheitscheck', icon: 'search', text: 'Auffälligkeiten bei Zugängen und Rechten', recht: 'security.check' as const },
  ];

  return (
    <>
      <Seitenkopf
        titel="HST Compliance"
        unter={gesamtsatz(punkte)}
      />

      <Hinweis art="warnung">
        <strong>Dieses System behauptet nicht, DSGVO-konform zu sein.</strong> Es unterscheidet
        zwischen <em>technisch umgesetzt</em> – das lässt sich hier feststellen – und
        <em> rechtlich geprüft</em> – das kann nur ein Mensch. Die Zentrale unterstützt die
        Einhaltung und hält Nachweise vor; sie ersetzt keine rechtliche Prüfung.
      </Hinweis>

      <h2 className="abschnitt" style={{ marginTop: 18 }}>Bereiche</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
        {bereiche
          .filter((b) => !b.recht || can(user.role, b.recht))
          .map((bereich) => (
            <Link key={bereich.href} href={bereich.href} className="kennzahl" style={{ gap: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 13 }}>
                <Icon name={bereich.icon} size={15} />
                {bereich.label}
              </span>
              <span className="kennzahl-zusatz">{bereich.text}</span>
            </Link>
          ))}
      </div>

      <h2 className="abschnitt" style={{ marginTop: 20 }}>Stand je Bereich</h2>
      <Karte>
        {punkte.length === 0 ? <Leer>Es ist noch nichts erfasst.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Bereich</th><th>Geführt</th><th>Davon</th><th>Stand</th><th>Was offen ist</th>
                </tr>
              </thead>
              <tbody>
                {punkte.map((punkt) => (
                  <tr key={punkt.titel}
                      className={punkt.stufe === 'offen' ? 'zeile-rot' : punkt.stufe === 'in_arbeit' ? 'zeile-gelb' : 'zeile-gruen'}>
                    <td><Link href={punkt.href} style={{ fontWeight: 500 }}>{punkt.titel}</Link></td>
                    <td className="zahl">{punkt.gefuehrt}</td>
                    <td className="zahl">
                      {punkt.geprueft === null
                        ? <span style={{ color: 'var(--text-3)' }}>–</span>
                        : <>
                            <span className={`marke marke-${punkt.geprueft < punkt.gefuehrt ? 'gelb' : 'gruen'}`}>
                              {punkt.geprueft} von {punkt.gefuehrt}
                            </span>
                            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>
                              {punkt.geprueftLabel ?? 'geprüft'}
                            </span>
                          </>}
                    </td>
                    <td>
                      <span className={`marke marke-${STUFE_FARBE[punkt.stufe]}`}>{STUFE_WORT[punkt.stufe]}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      {punkt.offen.length === 0
                        ? <span style={{ color: 'var(--text-3)' }}>–</span>
                        : <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {punkt.offen.map((zeile) => <li key={zeile}>{zeile}</li>)}
                          </ul>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <p style={{ marginTop: 14, fontSize: 11.5, color: 'var(--text-2)', maxWidth: '68ch', lineHeight: 1.55 }}>
        Die Spalte „Davon" zählt je Bereich etwas anderes, und darunter steht was: bei den
        meisten Bereichen Einträge mit dem Stand <em>rechtlich geprüft</em>, bei den technischen
        Maßnahmen dagegen die umgesetzten. Das ist nicht dasselbe – dass eine Maßnahme im System
        vorhanden ist, sagt nichts darüber, ob sie im Sinne des Art. 32 Abs. 1 angemessen ist.
        Den Stand <em>rechtlich geprüft</em> vergibt eine benannte Person, nicht das System, und
        er sagt, dass jemand hingesehen hat – nicht, dass das Ergebnis richtig war.
        Rechtsgrundlagen trägt das System von sich aus nie ein; sie stehen auf
        <em> noch nicht geprüft</em>, bis jemand entscheidet.
      </p>
    </>
  );
}
