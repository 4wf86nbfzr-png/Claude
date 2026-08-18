import { useEffect, useRef, useState } from 'react';
import type { useJarvis } from '../state/useJarvis';
import { Freigabekarte } from './Freigabekarte';
import { VoiceOrb } from './VoiceOrb';

const ZUSTANDSTEXT: Record<string, string> = {
  IDLE: 'Bereit',
  LISTENING: 'Listening',
  THINKING: 'Thinking',
  EXECUTING: 'Executing',
  WAITING_FOR_APPROVAL: 'Waiting for approval',
  SPEAKING: 'Speaking',
  ERROR: 'Fehler'
};

export function Gespraech({ j }: { j: ReturnType<typeof useJarvis> }) {
  const [entwurf, setEntwurf] = useState('');
  const ende = useRef<HTMLDivElement>(null);
  const freigabeAnker = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Wartet eine Freigabe, soll sie vollständig sichtbar sein – sonst genügt
    // das Ende des Verlaufs.
    const ziel = j.freigaben.length > 0 ? freigabeAnker.current : ende.current;
    ziel?.scrollIntoView({ behavior: 'smooth', block: j.freigaben.length > 0 ? 'start' : 'end' });
  }, [j.nachrichten, j.freigaben, j.fortschritt]);

  // Solange eine Freigabe aussteht, bekommt sie den Platz.
  const wartet = j.freigaben.length > 0;

  const absenden = () => {
    const text = entwurf;
    setEntwurf('');
    void j.senden(text);
  };

  return (
    <div className="inhalt inhalt--mitte">
      <div className={`buehne${wartet ? ' buehne--kompakt' : ''}`}>
        <VoiceOrb zustand={j.zustand} pegel={j.pegel} groesse={wartet ? 84 : 168} />
        <h1 className="buehne__titel">Jarvis</h1>
        <p className={`zustand zustand--${j.zustand}`}>
          <span className="zustand__punkt" />
          {ZUSTANDSTEXT[j.zustand] ?? j.zustand}
        </p>
      </div>

      <div className="gespraech">
        {j.nachrichten.length === 0 && (
          <p className="leer">
            Sagen Sie zum Beispiel: „Such mir fünfzehn Bauunternehmen in Hamburg für unsere Baustellenbewachung.“
          </p>
        )}
        {j.nachrichten.map((nachricht) => (
          <article key={nachricht.id} className={`beitrag beitrag--${nachricht.role}`}>
            <p className="beitrag__kopf">{nachricht.role === 'user' ? 'Sie' : (nachricht.agent ?? 'Jarvis')}</p>
            <p className="beitrag__text">{nachricht.content}</p>
            {nachricht.role === 'assistant' && (
              <button className="etikett" onClick={() => void j.vorlesen(nachricht.content)}>
                Vorlesen
              </button>
            )}
          </article>
        ))}

        {j.fortschritt && j.beschaeftigt && <p className="fortschritt">{j.fortschritt}</p>}
        {j.fehler && <p className="freigabe__hinweis">{j.fehler}</p>}

        <div ref={freigabeAnker} />
        {j.freigaben.map((ansicht) => (
          <Freigabekarte
            key={ansicht.approval.id}
            ansicht={ansicht}
            beschaeftigt={j.beschaeftigt}
            onEntscheiden={j.entscheiden}
            onVorlesen={j.vorlesen}
            onGeaendert={j.ladeFreigaben}
          />
        ))}

        <div ref={ende} />
      </div>

      <form
        className="eingabe"
        onSubmit={(event) => {
          event.preventDefault();
          absenden();
        }}
      >
        <textarea
          value={entwurf}
          onChange={(event) => setEntwurf(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              absenden();
            }
          }}
          placeholder="Auftrag eingeben oder Mikrofon benutzen …"
          aria-label="Nachricht an Jarvis"
          rows={1}
        />
        <button
          type="button"
          className="knopf knopf--mikro"
          aria-pressed={j.hoert}
          onClick={() => void j.mikrofonUmschalten()}
          title={j.hoert ? 'Aufnahme beenden' : 'Sprachaufnahme starten'}
        >
          {j.hoert ? 'Stopp' : 'Sprechen'}
        </button>
        <button type="submit" className="knopf knopf--stark" disabled={j.beschaeftigt || !entwurf.trim()}>
          Senden
        </button>
      </form>
    </div>
  );
}
