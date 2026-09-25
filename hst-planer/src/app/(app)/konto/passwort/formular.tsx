'use client';

import { useActionState } from 'react';
import { passwortAendern, type Ergebnis } from './actions';
import { Feld, Hinweis } from '@/components/ui';
import { AktionsKnopf } from '@/components/aktion';

export function PasswortFormular() {
  const [zustand, aktion] = useActionState<Ergebnis, FormData>(passwortAendern, {});
  return (
    <form action={aktion} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}
      <Feld label="Bisheriges Passwort" name="alt">
        <input id="alt" name="alt" type="password" className="feld" required autoComplete="current-password" />
      </Feld>
      <Feld label="Neues Passwort" name="neu" hinweis="Mindestens 12 Zeichen. Eine Wortfolge ist leichter zu merken als Sonderzeichen.">
        <input id="neu" name="neu" type="password" className="feld" required minLength={12} autoComplete="new-password" />
      </Feld>
      <Feld label="Neues Passwort wiederholen" name="wiederholung">
        <input id="wiederholung" name="wiederholung" type="password" className="feld" required minLength={12} autoComplete="new-password" />
      </Feld>
      <div><AktionsKnopf klasse="knopf knopf-primaer">Passwort speichern</AktionsKnopf></div>
    </form>
  );
}
