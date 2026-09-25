'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Feld, Hinweis } from '@/components/ui';
import { besondereKategorieAnlegen, besondereKategorieLesen, GRUNDLAGEN, type Ergebnis } from './actions';

function Knopf({ children, klasse = 'knopf knopf-primaer knopf-klein' }: { children: React.ReactNode; klasse?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={klasse} disabled={pending}>{pending ? 'Bitte warten …' : children}</button>;
}

/**
 * Eintrag einer besonderen Kategorie nach Art. 9 DSGVO (SecPlan 12).
 *
 * Die Rechtsgrundlage hat keinen Vorgabewert. Das ist der ganze Punkt:
 * ein vorausgewählter Eintrag wäre eine geratene Rechtsgrundlage.
 */
export function BesondereKategorieAnlegen({ employeeId }: { employeeId: string }) {
  const [zustand, anlegen] = useActionState<Ergebnis, FormData>(besondereKategorieAnlegen, {});
  const [offen, setOffen] = useState(false);

  if (!offen) {
    return (
      <button type="button" className="knopf knopf-klein" onClick={() => setOffen(true)}>
        Eintrag nach Art. 9 erfassen
      </button>
    );
  }

  return (
    <form action={anlegen} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 }}>
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}
      {zustand.hinweis && <Hinweis art="erfolg">{zustand.hinweis}</Hinweis>}

      <Hinweis art="warnung">
        Bitte nur erfassen, was für einen benannten Zweck gebraucht wird. Eine Diagnose gehört
        hier nicht hin – „Beschäftigungsverbot bis 12.06." sagt der Disposition alles Nötige
        und der Krankenakte nichts.
      </Hinweis>

      <input type="hidden" name="employeeId" value={employeeId} />

      <Feld label="Kategorie" name="kategorie" hinweis="Kurzbezeichnung, kein Freitext zur Erkrankung.">
        <input id="kategorie" name="kategorie" className="feld" required
               placeholder="z. B. Schwerbehinderung, Betriebsärztliche Bescheinigung" />
      </Feld>

      <Feld label="Inhalt" name="inhalt" hinweis="Wird verschlüsselt abgelegt und nur auf ausdrückliche Anforderung angezeigt.">
        <textarea id="inhalt" name="inhalt" className="feld" rows={3} required />
      </Feld>

      <Feld label="Rechtsgrundlage" name="grundlage" hinweis="Pflichtangabe. Das System trägt keine von sich aus ein.">
        <select id="grundlage" name="grundlage" className="feld" required defaultValue="">
          <option value="" disabled>bitte auswählen</option>
          {GRUNDLAGEN.map((g) => <option key={g.wert} value={g.wert}>{g.label}</option>)}
        </select>
      </Feld>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Feld label="Gültig bis" name="bis" hinweis="optional">
          <input id="bis" name="bis" type="date" className="feld" />
        </Feld>
        <Feld label="Löschdatum" name="loeschdatum" hinweis="Pflichtangabe – ohne Frist wird nie gelöscht.">
          <input id="loeschdatum" name="loeschdatum" type="date" className="feld" required />
        </Feld>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Knopf>Verschlüsselt speichern</Knopf>
        <button type="button" className="knopf knopf-klein" onClick={() => setOffen(false)}>Abbrechen</button>
      </div>
    </form>
  );
}

/** Inhalt einmalig anfordern – der Abruf steht im Protokoll. */
export function InhaltAnfordern({ id }: { id: string }) {
  const [zustand, lesen] = useActionState<Ergebnis & { geheimnis?: string }, FormData>(besondereKategorieLesen, {});

  if (zustand.geheimnis) {
    return (
      <span style={{ display: 'block', maxWidth: 360 }}>
        <code style={{
          display: 'block', padding: '6px 8px', background: 'var(--beige-flaeche)',
          border: '1px solid var(--beige)', borderRadius: 'var(--r)',
          fontSize: 12, whiteSpace: 'pre-wrap', userSelect: 'all',
        }}>
          {zustand.geheimnis}
        </code>
        <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
          Dieser Abruf steht im Protokoll.
        </span>
      </span>
    );
  }

  return (
    <form action={lesen}>
      {zustand.fehler && <span className="marke marke-rot">{zustand.fehler}</span>}
      <input type="hidden" name="id" value={id} />
      <Knopf klasse="knopf knopf-klein">Inhalt anzeigen</Knopf>
    </form>
  );
}
