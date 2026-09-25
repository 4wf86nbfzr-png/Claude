'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { anmelden, type AnmeldeZustand } from './actions';
import { Feld, Hinweis } from '@/components/ui';

function Knopf() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knopf knopf-primaer knopf-gross" style={{ width: '100%', justifyContent: 'center' }} disabled={pending}>
      {pending ? 'Wird geprüft …' : 'Anmelden'}
    </button>
  );
}

export function AnmeldeFormular() {
  const [zustand, aktion] = useActionState<AnmeldeZustand, FormData>(anmelden, {});

  return (
    <form action={aktion} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}

      <Feld label="E-Mail" name="email">
        <input id="email" name="email" type="email" className="feld" required autoComplete="username"
               autoFocus placeholder="vorname.nachname@hermserviceteam.com" style={{ height: 40 }} />
      </Feld>

      <Feld label="Passwort" name="passwort">
        <input id="passwort" name="passwort" type="password" className="feld" required autoComplete="current-password" style={{ height: 40 }} />
      </Feld>

      <Knopf />

      <Link href="/passwort-vergessen" style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>
        Passwort vergessen?
      </Link>
    </form>
  );
}
