import { useState } from 'react';
import type { FreigabeAnsicht } from '@shared/ipc';

interface Props {
  ansicht: FreigabeAnsicht;
  beschaeftigt: boolean;
  onEntscheiden: (approvalId: number, freigegeben: boolean) => void | Promise<void>;
  onVorlesen: (text: string) => void | Promise<void>;
  onGeaendert: () => void | Promise<void>;
}

/**
 * Die Freigabekarte (§11).
 *
 * Zeigt vor jedem Versand alles, was zur Entscheidung nötig ist: Empfänger,
 * Betreff, vollständigen Text und die Hinweise aus der Vorprüfung. Wer hier
 * bearbeitet, hebt die Freigabeanfrage auf – danach muss neu angefragt werden,
 * damit Text und Freigabe nie auseinanderfallen.
 */
export function Freigabekarte({ ansicht, beschaeftigt, onEntscheiden, onVorlesen, onGeaendert }: Props) {
  const { approval, email } = ansicht;
  const [bearbeiten, setBearbeiten] = useState(false);
  const [betreff, setBetreff] = useState(email?.subject ?? '');
  const [text, setText] = useState(email?.bodyText ?? '');
  const [meldung, setMeldung] = useState<string | null>(null);

  const empfaenger = (approval.payload.empfaenger as string[] | undefined) ?? email?.toAddresses ?? [];
  const hinweise = (approval.payload.hinweise as string[] | undefined) ?? [];
  const volltext = email?.bodyText ?? String(approval.payload.text ?? approval.summary);

  const speichern = async () => {
    if (!email) return;
    await window.jarvis.entwurfAendern(email.id, { subject: betreff, bodyText: text });
    setMeldung(
      'Der Entwurf wurde geändert. Die vorherige Freigabeanfrage ist damit hinfällig – bitte erneut freigeben lassen.'
    );
    setBearbeiten(false);
    await onGeaendert();
  };

  return (
    <section className="freigabe" aria-live="polite">
      <p className="freigabe__titel">Aktion benötigt Freigabe</p>
      <dl>
        <dt>Aktion</dt>
        <dd>{approval.action === 'send_email' ? 'E-Mail versenden' : approval.action}</dd>
        {empfaenger.length > 0 && (
          <>
            <dt>Empfänger</dt>
            <dd>{empfaenger.join(', ')}</dd>
          </>
        )}
        {email && (
          <>
            <dt>Betreff</dt>
            <dd>
              {bearbeiten ? (
                <input value={betreff} onChange={(e) => setBetreff(e.target.value)} aria-label="Betreff" />
              ) : (
                email.subject
              )}
            </dd>
          </>
        )}
      </dl>

      {hinweise.map((hinweis) => (
        <p key={hinweis} className="freigabe__hinweis">
          {hinweis}
        </p>
      ))}

      <div className="freigabe__text">
        {bearbeiten && email ? (
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Mailtext" />
        ) : (
          volltext
        )}
      </div>

      <div className="freigabe__knoepfe">
        <button className="knopf" onClick={() => void onVorlesen(volltext)}>
          Vorlesen
        </button>
        {email && !bearbeiten && (
          <button className="knopf" onClick={() => setBearbeiten(true)}>
            Bearbeiten
          </button>
        )}
        {bearbeiten && (
          <>
            <button className="knopf" onClick={() => void speichern()}>
              Änderung speichern
            </button>
            <button
              className="knopf"
              onClick={() => {
                setBearbeiten(false);
                setBetreff(email?.subject ?? '');
                setText(email?.bodyText ?? '');
              }}
            >
              Verwerfen
            </button>
          </>
        )}
        <button
          className="knopf knopf--gefahr"
          disabled={beschaeftigt}
          onClick={() => void onEntscheiden(approval.id, false)}
        >
          Abbrechen
        </button>
        <button
          className="knopf knopf--stark"
          disabled={beschaeftigt || bearbeiten}
          onClick={() => void onEntscheiden(approval.id, true)}
        >
          {approval.action === 'send_email' ? 'Freigeben & senden' : 'Freigeben'}
        </button>
      </div>

      {meldung && <p className="meldung">{meldung}</p>}
    </section>
  );
}
