'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { dateiHochladenAktion, type Ergebnis } from '../actions';
import { Feld, Hinweis } from '@/components/ui';

function Knopf({ bereit }: { bereit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knopf knopf-primaer" disabled={pending || !bereit}>
      {pending ? 'Datei wird gelesen …' : 'Hochladen und Spalten zuordnen'}
    </button>
  );
}

export function HochladeFormular() {
  const [zustand, aktion] = useActionState<Ergebnis, FormData>(dateiHochladenAktion, {});
  const [dateiname, setDateiname] = useState('');

  return (
    <form action={aktion} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}

      <Feld label="Bezeichnung" name="name" hinweis="Zum Wiederfinden, z. B. „Elbwacht Oktober 2026“.">
        <input id="name" name="name" className="feld" placeholder="Abgleich Oktober" />
      </Feld>

      <Feld label="Datei" name="datei" hinweis="Erlaubt sind .xlsx, .xlsm und .csv bis 20 MB.">
        <input id="datei" name="datei" type="file" className="feld" required
               accept=".xlsx,.xlsm,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
               style={{ height: 'auto', padding: 8 }}
               onChange={(e) => setDateiname(e.target.files?.[0]?.name ?? '')} />
      </Feld>

      {dateiname && <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Ausgewaehlt: {dateiname}</p>}

      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
        Die Datei wird nur gelesen und gespeichert – es werden noch keine Zeiten übernommen.
        Vor dem Import sehen Sie eine Vorschau und können die Zuordnung anpassen.
      </p>

      <div><Knopf bereit={Boolean(dateiname)} /></div>
    </form>
  );
}
