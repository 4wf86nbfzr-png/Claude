'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Feld, Hinweis } from '@/components/ui';
import { passwortNeuAktion, type Zustand } from './actions';

function Knopf() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knopf knopf-primaer knopf-gross"
            style={{ width: '100%', justifyContent: 'center' }} disabled={pending}>
      {pending ? 'Wird gespeichert …' : 'Passwort speichern'}
    </button>
  );
}

export function NeuFormular({ token, name }: { token: string; name: string }) {
  const [zustand, speichern] = useActionState<Zustand, FormData>(passwortNeuAktion, {});

  return (
    <form action={speichern} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}

      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
        Hallo {name}. Bitte vergeben Sie ein neues Passwort – mindestens zwölf Zeichen.
        Mit dem Speichern werden alle offenen Sitzungen beendet.
      </p>

      <input type="hidden" name="token" value={token} />

      <Feld label="Neues Passwort" name="neu">
        <input id="neu" name="neu" type="password" className="feld" required minLength={12}
               autoFocus autoComplete="new-password" style={{ height: 40 }} />
      </Feld>

      <Feld label="Wiederholung" name="wiederholung">
        <input id="wiederholung" name="wiederholung" type="password" className="feld" required
               minLength={12} autoComplete="new-password" style={{ height: 40 }} />
      </Feld>

      <Knopf />

      <Link href="/anmelden" style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>
        Zurück zur Anmeldung
      </Link>
    </form>
  );
}
