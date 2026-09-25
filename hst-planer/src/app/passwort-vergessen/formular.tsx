'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Feld, Hinweis } from '@/components/ui';
import { zuruecksetzenAktion, type Zustand } from './actions';

function Knopf() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knopf knopf-primaer knopf-gross"
            style={{ width: '100%', justifyContent: 'center' }} disabled={pending}>
      {pending ? 'Wird gesendet …' : 'Link anfordern'}
    </button>
  );
}

export function VergessenFormular() {
  const [zustand, anfordern] = useActionState<Zustand, FormData>(zuruecksetzenAktion, {});

  if (zustand.erledigt) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Hinweis art="erfolg">
          Wenn zu dieser Adresse ein Zugang besteht, ist eine E-Mail unterwegs. Der Link darin
          gilt eine Stunde und genau einmal.
        </Hinweis>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>
          Keine E-Mail bekommen? Dann besteht zu dieser Adresse entweder kein Zugang, oder der
          Mailversand ist noch nicht eingerichtet. In beiden Fällen hilft die Administration
          weiter – sie kann ein Startpasswort vergeben.
        </p>
        <Link href="/anmelden" className="knopf" style={{ justifyContent: 'center' }}>
          Zurück zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <form action={anfordern} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}

      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
        Geben Sie die E-Mail-Adresse Ihres Zugangs an. Wir schicken Ihnen einen Link, mit dem
        Sie ein neues Passwort vergeben können.
      </p>

      <Feld label="E-Mail" name="email">
        <input id="email" name="email" type="email" className="feld" required autoFocus
               autoComplete="username" style={{ height: 40 }} />
      </Feld>

      <Knopf />

      <Link href="/anmelden" style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>
        Zurück zur Anmeldung
      </Link>
    </form>
  );
}
