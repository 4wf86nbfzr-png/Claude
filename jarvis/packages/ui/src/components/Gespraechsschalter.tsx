import { useState } from 'react';
import type { Empfindlichkeit } from '@jarvis/core/schnips';
import { useGespraech } from '../lib/gespraechskontext.js';

/**
 * Die Bedienung des Zuhörens.
 *
 * Nur noch Anzeige und Schalter — der Zustand liegt eine Ebene höher, damit
 * JARVIS auch dann hört, wenn diese Ansicht gar nicht offen ist.
 *
 * Bewusst standardmäßig **aus**: Dauerbetrieb des Mikrofons ist nichts, was
 * man jemandem unterschiebt. Die Zeile darüber sagt in klaren Worten, was
 * dabei passiert und was nicht.
 */
export function Gespraechsschalter(): JSX.Element {
  const { einstellungen, aendern, zustand, fehler, sttHinweis, starten, beenden } = useGespraech();
  const [details, setDetails] = useState(false);

  return (
    <div className="schnips">
      <div className="schnips__reihe">
        <label className="schnips__schalter">
          <input
            type="checkbox"
            checked={einstellungen.an}
            onChange={(e) => aendern({ an: e.target.checked })}
          />
          <span>Auf Schnipsen hören</span>
        </label>

        {einstellungen.an && (
          <span className={`merkmal ${zustand === 'schlafend' ? '' : 'merkmal--ok'}`}>
            {zustand === 'schlafend' ? 'wartet auf Schnipsen' : 'im Gespräch'}
          </span>
        )}

        {zustand !== 'schlafend' && (
          <button type="button" className="knopf knopf--klein" onClick={beenden}>
            Gespräch beenden
          </button>
        )}
        {zustand === 'schlafend' && (
          <button type="button" className="knopf knopf--klein" onClick={starten}>
            Ohne Schnipsen starten
          </button>
        )}

        <button
          type="button"
          className="knopf knopf--klein"
          onClick={() => setDetails((d) => !d)}
          aria-expanded={details}
        >
          {details ? 'Weniger' : 'Einstellungen'}
        </button>
      </div>

      {einstellungen.an && (
        <p className="schnips__hinweis">
          Das Mikrofon ist offen — auch wenn das Fenster geschlossen ist, denn sonst wäre
          „hört auf Ihr Schnipsen" nicht wahr. Der Ton wird nur hier im Gerät ausgewertet:
          nichts wird aufgezeichnet und nichts verschickt, bis Sie nach dem Schnipsen
          wirklich sprechen.
        </p>
      )}

      {details && (
        <div className="schnips__details">
          <label className="schnips__feld">
            <span className="feld__label">Empfindlichkeit</span>
            <select
              value={einstellungen.empfindlichkeit}
              onChange={(e) => aendern({ empfindlichkeit: e.target.value as Empfindlichkeit })}
            >
              <option value="streng">streng — reagiert nur auf deutliches Schnipsen</option>
              <option value="normal">normal</option>
              <option value="locker">locker — reagiert früher, öfter Fehlalarm</option>
            </select>
          </label>

          <label className="schnips__schalter">
            <input
              type="checkbox"
              checked={einstellungen.doppelschnipsen}
              onChange={(e) => aendern({ doppelschnipsen: e.target.checked })}
            />
            <span>Zweimal schnipsen (deutlich weniger Fehlauslöser)</span>
          </label>

          <p className="schnips__hinweis">
            Eine rein akustische Erkennung ist nicht perfekt: Klatschen, ein zufallender Deckel
            oder ein harter Tastenanschlag können ähnlich klingen. Wenn JARVIS zu oft von selbst
            anspringt, hilft „streng" oder zweimal schnipsen. Zuverlässig und ohne Fehlauslöser
            geht es mit <strong>Cmd + Alt + J</strong> — das gilt systemweit, auch aus einem
            anderen Programm heraus.
          </p>
        </div>
      )}

      {sttHinweis && !fehler && <p className="hinweis hinweis--warn">{sttHinweis}</p>}
      {fehler && <p className="hinweis hinweis--warn">{fehler}</p>}
    </div>
  );
}
