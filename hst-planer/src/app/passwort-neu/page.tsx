import Link from 'next/link';
import type { Metadata } from 'next';
import { tokenPruefen } from '@/lib/auth/zuruecksetzen';
import { Hinweis } from '@/components/ui';
import { Logo } from '@/components/logo';
import { NeuFormular } from './formular';

export const metadata: Metadata = { title: 'Neues Passwort' };
export const dynamic = 'force-dynamic';

/**
 * Neues Passwort über einen Zurücksetz-Link (SecPlan 14).
 *
 * Der Token wird hier nur geprüft, nicht verbraucht – sonst wäre er
 * schon weg, bevor jemand das Formular ausgefüllt hat. Verbraucht wird
 * er beim Speichern.
 */
export default async function PasswortNeu({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const token = params.token ?? '';
  const treffer = token ? await tokenPruefen(token) : null;

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20, background: 'var(--flaeche)' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 26 }}>
          <Logo groesse={40} />
          <h1 style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-.01em', margin: 0 }}>Neues Passwort</h1>
        </div>

        <div className="karte" style={{ padding: 20 }}>
          {treffer ? (
            <NeuFormular token={token} name={treffer.name} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Hinweis art="fehler">
                Dieser Link gilt nicht mehr. Er läuft nach einer Stunde ab und lässt sich nur
                einmal benutzen.
              </Hinweis>
              <Link href="/passwort-vergessen" className="knopf knopf-primaer" style={{ justifyContent: 'center' }}>
                Neuen Link anfordern
              </Link>
              <Link href="/anmelden" style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>
                Zurück zur Anmeldung
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
