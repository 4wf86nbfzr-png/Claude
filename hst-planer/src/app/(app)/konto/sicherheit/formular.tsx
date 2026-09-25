'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Feld, Hinweis } from '@/components/ui';
import {
  faktorAbschalten, faktorBestaetigen, faktorVorbereiten, sitzungenBeenden,
  type Ergebnis,
} from './actions';

function Knopf({ children, klasse = 'knopf knopf-primaer' }: { children: React.ReactNode; klasse?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={klasse} disabled={pending}>{pending ? 'Bitte warten …' : children}</button>;
}

function Meldung({ zustand }: { zustand: Ergebnis }) {
  if (zustand.fehler) return <Hinweis art="fehler">{zustand.fehler}</Hinweis>;
  if (zustand.hinweis) return <Hinweis art="erfolg">{zustand.hinweis}</Hinweis>;
  return null;
}

/** Das Geheimnis in Vierergruppen – so tippt es sich ohne Verzählen ab. */
function gruppiert(geheimnis: string): string {
  return geheimnis.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Einrichtung des zweiten Faktors (SecPlan 14).
 *
 * Bewusst ohne QR-Code: ein eigener QR-Encoder wäre mehrere hundert
 * Zeilen Reed-Solomon-Arithmetik, die niemand nachprüft, und eine
 * externe Bibliothek dafür wäre eine Abhängigkeit an einer Stelle, an
 * der Abhängigkeiten besonders teuer sind. Jede Authenticator-App kann
 * ein Geheimnis von Hand aufnehmen; die Adresse steht zusätzlich da und
 * funktioniert auf dem Telefon per Antippen.
 */
export function FaktorEinrichten() {
  const [vorbereitet, vorbereiten] = useActionState<Ergebnis, FormData>(faktorVorbereiten, {});
  const [bestaetigt, bestaetigen] = useActionState<Ergebnis, FormData>(faktorBestaetigen, {});

  if (bestaetigt.erfolg) {
    return <Hinweis art="erfolg">{bestaetigt.hinweis}</Hinweis>;
  }

  if (!vorbereitet.geheimnis) {
    return (
      <form action={vorbereiten} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 380 }}>
        <Meldung zustand={vorbereitet} />
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>
          Sie brauchen eine Authenticator-App auf dem Telefon. Zum Start bitte das eigene
          Passwort bestätigen.
        </p>
        <Feld label="Passwort" name="passwort">
          <input id="passwort" name="passwort" type="password" className="feld" required autoComplete="current-password" />
        </Feld>
        <Knopf>Einrichtung starten</Knopf>
      </form>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
      <Hinweis art="warnung">
        Dieses Geheimnis wird nur jetzt angezeigt. Bitte in der App eintragen, bevor Sie
        weitergehen.
      </Hinweis>

      <div>
        <span className="feld-label">Geheimnis zum Abtippen</span>
        <code style={{
          display: 'block', padding: '10px 12px', marginTop: 4,
          background: 'var(--tief)', border: '1px solid var(--linie-2)', borderRadius: 'var(--r)',
          fontFamily: 'var(--font-mono)', fontSize: 14, letterSpacing: '.08em',
          userSelect: 'all', wordBreak: 'break-all',
        }}>
          {gruppiert(vorbereitet.geheimnis)}
        </code>
        <span className="feld-hinweis">
          Kontoname: die eigene E-Mail-Adresse. Typ: zeitbasiert, 6 Stellen, 30 Sekunden.
        </span>
      </div>

      {vorbereitet.adresse && (
        <details>
          <summary className="knopf knopf-klein" style={{ display: 'inline-flex' }}>Adresse für das Telefon anzeigen</summary>
          <code style={{
            display: 'block', marginTop: 8, padding: '8px 10px',
            background: 'var(--tief)', border: '1px solid var(--linie-2)', borderRadius: 'var(--r)',
            fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all', userSelect: 'all',
          }}>
            {vorbereitet.adresse}
          </code>
          <span className="feld-hinweis">
            Auf dem Telefon geöffnet, trägt diese Adresse das Konto direkt in die App ein.
          </span>
        </details>
      )}

      <form action={bestaetigen} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Meldung zustand={bestaetigt} />
        <Feld label="Erster Code aus der App" name="code" hinweis="Damit ist sichergestellt, dass die App wirklich funktioniert.">
          <input id="code" name="code" type="text" className="feld" required inputMode="numeric"
                 autoComplete="one-time-code" maxLength={7} placeholder="123456"
                 style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.3em' }} />
        </Feld>
        <Knopf>Zweiten Faktor aktivieren</Knopf>
      </form>
    </div>
  );
}

export function FaktorAbschalten() {
  const [zustand, abschalten] = useActionState<Ergebnis, FormData>(faktorAbschalten, {});
  const [offen, setOffen] = useState(false);

  if (zustand.erfolg) return <Hinweis art="erfolg">{zustand.hinweis}</Hinweis>;

  if (!offen) {
    return (
      <button type="button" className="knopf knopf-klein knopf-gefahr" onClick={() => setOffen(true)}>
        Zweiten Faktor abschalten
      </button>
    );
  }

  return (
    <form action={abschalten} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380 }}>
      <Meldung zustand={zustand} />
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>
        Zum Abschalten braucht es Passwort <strong>und</strong> einen gültigen Code. Wer nur das
        Passwort hat, soll den Schutz nicht entfernen können – davor soll er ja gerade schützen.
        Telefon verloren? Dann hilft die Systemadministration.
      </p>
      <Feld label="Passwort" name="passwort">
        <input id="ab-passwort" name="passwort" type="password" className="feld" required autoComplete="current-password" />
      </Feld>
      <Feld label="Aktueller Code" name="code">
        <input id="ab-code" name="code" type="text" className="feld" required inputMode="numeric"
               maxLength={7} style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.3em' }} />
      </Feld>
      <div style={{ display: 'flex', gap: 8 }}>
        <Knopf klasse="knopf knopf-gefahr">Abschalten</Knopf>
        <button type="button" className="knopf" onClick={() => setOffen(false)}>Abbrechen</button>
      </div>
    </form>
  );
}

export function SitzungenBeenden() {
  const [zustand, beenden] = useActionState<Ergebnis, FormData>(
    (z: Ergebnis) => sitzungenBeenden(z),
    {},
  );
  return (
    <form action={beenden} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Meldung zustand={zustand} />
      <Knopf klasse="knopf knopf-klein">Alle anderen Sitzungen beenden</Knopf>
    </form>
  );
}
