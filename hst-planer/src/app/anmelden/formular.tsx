'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { anmelden, type AnmeldeZustand } from './actions';
import { Feld, Hinweis } from '@/components/ui';

function Knopf({ text, laufend }: { text: string; laufend: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knopf knopf-primaer knopf-gross"
            style={{ width: '100%', justifyContent: 'center' }} disabled={pending}>
      {pending ? laufend : text}
    </button>
  );
}

/**
 * Anmeldung in zwei Schritten (SecPlan 14).
 *
 * Der zweite Schritt erscheint erst, wenn das Passwort stimmt und das
 * Konto einen zweiten Faktor eingerichtet hat. Vorher ist nicht
 * erkennbar, ob eines existiert – sonst wäre die Anmeldemaske eine
 * Auskunft darüber, welche Konten wie geschützt sind.
 */
export function AnmeldeFormular() {
  const [zustand, aktion] = useActionState<AnmeldeZustand, FormData>(anmelden, {});
  const zweiterSchritt = Boolean(zustand.faktorNoetig);

  return (
    <form action={aktion} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}

      {zweiterSchritt ? (
        <>
          <Hinweis art="info">
            Für dieses Konto ist ein zweiter Faktor eingerichtet. Bitte den aktuellen
            sechsstelligen Code aus Ihrer Authenticator-App eingeben.
          </Hinweis>

          {/* Adresse und Passwort werden mitgeschickt, damit der Server
              nicht zwischen zwei Aufrufen etwas über das Konto behalten muss. */}
          <input type="hidden" name="email" value={zustand.email ?? ''} />

          <Feld label="Passwort" name="passwort">
            <input id="passwort" name="passwort" type="password" className="feld" required
                   autoComplete="current-password" style={{ height: 40 }} />
          </Feld>

          <Feld label="Code aus der App" name="code" hinweis="Sechs Ziffern, wechselt alle 30 Sekunden.">
            <input id="code" name="code" type="text" className="feld" required autoFocus
                   inputMode="numeric" autoComplete="one-time-code" maxLength={7}
                   placeholder="123456"
                   style={{ height: 40, fontFamily: 'var(--font-mono)', letterSpacing: '.3em', fontSize: 17 }} />
          </Feld>

          <Knopf text="Anmelden" laufend="Wird geprüft …" />
        </>
      ) : (
        <>
          <Feld label="E-Mail" name="email">
            <input id="email" name="email" type="email" className="feld" required autoComplete="username"
                   autoFocus placeholder="vorname.nachname@hermserviceteam.com" style={{ height: 40 }} />
          </Feld>

          <Feld label="Passwort" name="passwort">
            <input id="passwort" name="passwort" type="password" className="feld" required
                   autoComplete="current-password" style={{ height: 40 }} />
          </Feld>

          <Knopf text="Anmelden" laufend="Wird geprüft …" />

          <Link href="/passwort-vergessen" style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>
            Passwort vergessen?
          </Link>
        </>
      )}
    </form>
  );
}
