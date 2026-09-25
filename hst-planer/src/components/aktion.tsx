'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Hinweis } from './ui';

export interface Ergebnis {
  fehler?: string;
  hinweis?: string;
  erfolg?: boolean;
  details?: unknown;
  /** Einmalig anzuzeigender Wert (neues Passwort, API-Schlüssel, Webhook-Geheimnis). */
  geheimnis?: string;
}
export type Aktion = (zustand: Ergebnis, formData: FormData) => Promise<Ergebnis>;

export function AktionsKnopf({ children, klasse = 'knopf', laufend, ...rest }: { children: ReactNode; klasse?: string; laufend?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={klasse} disabled={pending || rest.disabled} {...rest}>
      {pending ? (laufend ?? 'Bitte warten …') : children}
    </button>
  );
}

/**
 * Formular für eine Server-Aktion. Zeigt Fehler und Bestaetigungen direkt
 * an Ort und Stelle – ohne Umweg über eine Fehlerseite (Spec 53).
 */
export function AktionsFormular({
  aktion, children, stil, meldungOben = true, klasse, geheimnisLabel,
}: {
  aktion: Aktion;
  children: ReactNode;
  stil?: React.CSSProperties;
  meldungOben?: boolean;
  klasse?: string;
  /**
   * Beschriftung für einen einmalig anzuzeigenden Wert (Passwort, Schlüssel).
   * Ist sie gesetzt, wird `zustand.geheimnis` gut lesbar und kopierbar ausgegeben.
   */
  geheimnisLabel?: string;
}) {
  const [zustand, ausfuehren] = useActionState<Ergebnis, FormData>(aktion, {});
  const meldung = zustand.fehler
    ? <Hinweis art="fehler">{zustand.fehler}</Hinweis>
    : zustand.hinweis && !zustand.geheimnis ? <Hinweis art="erfolg">{zustand.hinweis}</Hinweis> : null;

  const geheimnis = zustand.geheimnis ? (
    <div style={{ flex: '1 1 100%', marginTop: 8 }}>
      <Hinweis art="erfolg">
        <strong>{geheimnisLabel ?? 'Einmalig sichtbar'}:</strong>{' '}
        <code style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all', userSelect: 'all' }}>{zustand.geheimnis}</code>
        <br />
        <span style={{ fontSize: 12 }}>Bitte jetzt notieren – dieser Wert wird nicht erneut angezeigt.</span>
      </Hinweis>
    </div>
  ) : null;

  return (
    <form action={ausfuehren} style={stil} className={klasse}>
      {meldungOben && meldung}
      {children}
      {!meldungOben && meldung}
      {geheimnis}
    </form>
  );
}

/**
 * Ausklappbarer Bereich für selten gebrauchte Aktionen.
 * Bewusst auf <details> gebaut: funktioniert ohne JavaScript, ist per
 * Tastatur bedienbar und braucht keine Fokusfalle wie ein Dialog.
 */
export function Ausklapp({ titel, children, knopfKlasse = 'knopf', offen }: { titel: ReactNode; children: ReactNode; knopfKlasse?: string; offen?: boolean }) {
  return (
    <details open={offen} style={{ display: 'inline-block' }}>
      <summary className={knopfKlasse} style={{ listStyle: 'none', cursor: 'pointer', userSelect: 'none' }}>{titel}</summary>
      <div style={{ marginTop: 10 }}>{children}</div>
    </details>
  );
}
