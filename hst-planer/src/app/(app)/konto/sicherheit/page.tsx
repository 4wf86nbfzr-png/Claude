import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { Hinweis, Karte, Leer, Paar, Seitenkopf } from '@/components/ui';
import { FaktorAbschalten, FaktorEinrichten, SitzungenBeenden } from './formular';

export const metadata: Metadata = { title: 'Sicherheit' };
export const dynamic = 'force-dynamic';

/**
 * Sicherheit des eigenen Kontos (SecPlan 14).
 *
 * Zweiter Faktor, offene Sitzungen, letzte Anmeldungen. Für Rollen mit
 * Zugriff auf Personalakten oder die Benutzerverwaltung steht hier ein
 * ausdrücklicher Hinweis: ein Passwort allein trägt bei einem solchen
 * Zugang nicht.
 */
export default async function Sicherheit() {
  const user = await seite();

  const [konto, sitzungen] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: { totpEnabled: true, lastLoginAt: true, failedLogins: true, updatedAt: true, mustChangePassword: true },
    }),
    db.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const privilegiert = can(user.role, 'employees.file') || can(user.role, 'admin.users') || user.role === 'SUPERADMIN';

  return (
    <>
      <Seitenkopf
        titel="Sicherheit"
        unter={user.email}
        aktionen={<Link href="/konto/passwort" className="knopf knopf-klein">Passwort ändern</Link>}
      />

      {privilegiert && !konto?.totpEnabled && (
        <div style={{ marginBottom: 14 }}>
          <Hinweis art="fehler">
            <strong>Dieser Zugang kann Personalakten öffnen.</strong> Ein Passwort allein trägt
            dafür nicht. Bitte richten Sie einen zweiten Faktor ein.
          </Hinweis>
        </div>
      )}

      <div className="zweispaltig" style={{ ['--zweite' as string]: '280px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Karte titel="Zweiter Faktor">
            <div style={{ padding: 14 }}>
              {konto?.totpEnabled ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Paar label="Stand">
                    <span className="marke marke-gruen">eingerichtet</span>
                  </Paar>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', maxWidth: '60ch' }}>
                    Bei jeder Anmeldung wird zusätzlich ein sechsstelliger Code aus Ihrer App
                    verlangt. Wer Ihr Passwort kennt, kommt damit allein nicht hinein.
                  </p>
                  <FaktorAbschalten />
                </div>
              ) : (
                <FaktorEinrichten />
              )}
            </div>
          </Karte>

          <Karte titel="Offene Sitzungen">
            {sitzungen.length === 0 ? <Leer>Keine offene Sitzung.</Leer> : (
              <div className="tabelle-scroll">
                <table className="tabelle">
                  <thead><tr><th>Seit</th><th>Adresse</th><th>Gerät</th><th>Läuft ab</th><th /></tr></thead>
                  <tbody>
                    {sitzungen.map((sitzung) => (
                      <tr key={sitzung.id} className={sitzung.id === user.sessionId ? 'zeile-gruen' : undefined}>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(sitzung.createdAt)}</td>
                        <td className="zahl" style={{ fontSize: 11 }}>{sitzung.ip ?? '–'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 280 }}>
                          {sitzung.userAgent ?? '–'}
                        </td>
                        <td className="zahl">{formatDateDE(sitzung.expiresAt)}</td>
                        <td>
                          {sitzung.id === user.sessionId && <span className="marke marke-gruen">dieses Gerät</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="karte-fuss">
              <SitzungenBeenden />
            </div>
          </Karte>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Karte titel="Kontostand">
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Paar label="Rolle">{user.role}</Paar>
              <Paar label="Letzte Anmeldung">
                {konto?.lastLoginAt ? formatDateDE(konto.lastLoginAt) : 'noch nie'}
              </Paar>
              <Paar label="Passwort zuletzt geändert">
                {konto?.updatedAt ? formatDateDE(konto.updatedAt) : '–'}
              </Paar>
              <Paar label="Fehlversuche">
                {konto && konto.failedLogins > 0
                  ? <span className="marke marke-gelb">{konto.failedLogins}</span>
                  : <span className="marke marke-gruen">keine</span>}
              </Paar>
            </div>
          </Karte>

          <Karte titel="Was hier geschützt ist">
            <div style={{ padding: 14, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
              <p style={{ margin: '0 0 8px' }}>
                Passwörter werden nur als Hash gespeichert – im Klartext existiert Ihres nirgends,
                auch nicht in einem Protokoll.
              </p>
              <p style={{ margin: '0 0 8px' }}>
                Nach mehreren Fehlversuchen wird das Konto vorübergehend gesperrt. Ein Wechsel des
                Passworts beendet alle anderen Sitzungen.
              </p>
              <p style={{ margin: 0 }}>
                Jede Anmeldung steht im Protokoll – die erfolgreiche wie die gescheiterte.
              </p>
            </div>
          </Karte>
        </div>
      </div>
    </>
  );
}
