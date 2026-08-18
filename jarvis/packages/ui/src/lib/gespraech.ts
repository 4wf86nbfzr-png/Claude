import { schweig, sprich, starteDiktat, type Diktat } from './voice.js';

/**
 * Die Gesprächsschleife.
 *
 * Zuhören → antworten → weiter zuhören, bis es still bleibt. Zwei Dinge
 * machen den Unterschied zwischen „Sprachbefehl" und „Gespräch":
 *
 *  - **Reinreden ist erlaubt.** Wer JARVIS ins Wort fällt, bringt ihn zum
 *    Schweigen. Ein Assistent, den man ausreden lassen muss, fühlt sich
 *    nicht wie ein Gegenüber an.
 *  - **Ende durch Stille.** Nach der Antwort bleibt das Mikrofon offen. Sagt
 *    man nichts mehr, verabschiedet er sich von selbst, statt ewig zu warten.
 */

export type GespraechsZustand = 'schlafend' | 'hoert' | 'denkt' | 'spricht';

/**
 * Fehler, nach denen ein Neustart der Erkennung sinnlos ist. Ohne diese Liste
 * dreht die Schleife endlos: die Erkennung bricht ab, `onEnde` startet sie
 * wieder, sie bricht wieder ab -- und die Anzeige behauptet dabei die ganze
 * Zeit, JARVIS höre zu.
 */
const ENDGUELTIGE_FEHLER = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'start']);

/** So oft darf die Erkennung ins Leere laufen, bevor wir aufgeben. */
const MAX_LEERSTARTS = 5;

export interface GespraechsOptionen {
  /** Schickt den Satz an den Kern und liefert die Antwort. */
  frage: (text: string) => Promise<string | null>;
  /** Was JARVIS zur Eröffnung sagt. */
  eroeffnung: () => Promise<string>;
  onZustand: (zustand: GespraechsZustand) => void;
  onGesagt: (wer: 'benutzer' | 'jarvis', text: string) => void;
  onZwischentext?: (text: string) => void;
  /**
   * `endgueltig` heißt: ein weiterer Versuch bringt nichts (kein Mikrofon,
   * Zugriff verweigert). Der Aufrufer sollte dann nicht einfach neu starten.
   */
  onFehler: (meldung: string, endgueltig?: boolean) => void;
  /** Nach so vielen Millisekunden Stille endet das Gespräch. */
  stillePauseMs?: number;
}

export interface Gespraech {
  beenden(): void;
  zustand(): GespraechsZustand;
}

export function starteGespraech(optionen: GespraechsOptionen): Gespraech {
  const stillePause = optionen.stillePauseMs ?? 12_000;

  let zustand: GespraechsZustand = 'schlafend';
  let diktat: Diktat | null = null;
  let stilleTimer: number | null = null;
  let beendet = false;
  /** Sammelt, was seit der letzten Antwort gesagt wurde. */
  let gesagt = '';
  let sendeTimer: number | null = null;
  /** Starts der Erkennung, seit zuletzt etwas verstanden wurde. */
  let leerstarts = 0;
  /** Laufende Nummer der Erkennung, um abgelöste Läufe zu erkennen. */
  let lauf = 0;

  const setze = (z: GespraechsZustand) => {
    zustand = z;
    optionen.onZustand(z);
  };

  const stilleNeuStarten = () => {
    if (stilleTimer) window.clearTimeout(stilleTimer);
    stilleTimer = window.setTimeout(() => {
      if (beendet) return;
      optionen.onGesagt('jarvis', 'Ich bin dann wieder still. Schnipsen Sie, wenn Sie mich brauchen.');
      sprich('Ich bin dann wieder still.', { unterbrechen: false });
      beenden();
    }, stillePause);
  };

  /**
   * Sendet, was gesagt wurde -- aber erst, wenn kurz Ruhe ist. Ohne diese
   * Verzögerung würde jeder Halbsatz einzeln abgeschickt.
   */
  const planeSenden = () => {
    if (sendeTimer) window.clearTimeout(sendeTimer);
    sendeTimer = window.setTimeout(() => void absenden(), 900);
  };

  const absenden = async () => {
    const text = gesagt.trim();
    gesagt = '';
    if (!text || beendet) return;

    diktat?.stop();
    setze('denkt');
    optionen.onGesagt('benutzer', text);

    const antwort = await optionen.frage(text);
    if (beendet) return;

    if (antwort) {
      setze('spricht');
      optionen.onGesagt('jarvis', antwort);
      sprich(antwort, { unterbrechen: true });
    }
    // Direkt weiter zuhören -- das Gespräch läuft.
    hoerenStarten();
  };

  const hoerenStarten = () => {
    if (beendet) return;
    diktat?.stop();

    // Jede Erkennung bekommt eine Nummer. Die abgelöste meldet ihr Ende noch
    // nach -- ohne diese Marke würde sie einen zweiten Lauf anstoßen und wir
    // hätten zwei Erkennungen auf demselben Mikrofon.
    lauf += 1;
    const meiner = lauf;
    const veraltet = () => meiner !== lauf;

    diktat = starteDiktat({
      sprache: 'de-DE',
      onText: ({ text, endgueltig }) => {
        if (beendet || veraltet()) return;
        leerstarts = 0;
        stilleNeuStarten();

        // Reinreden: sobald der Mensch spricht, hört JARVIS auf zu reden.
        if (zustand === 'spricht') {
          schweig();
          setze('hoert');
        }

        if (endgueltig) {
          gesagt = gesagt ? `${gesagt} ${text}` : text;
          optionen.onZwischentext?.('');
          planeSenden();
        } else {
          optionen.onZwischentext?.(text);
        }
      },
      // Kein `veraltet()` hier: die Erkennung meldet ihren Fehler oft erst,
      // wenn der nächste Lauf schon steht. Ein endgültiger Fehler bleibt aber
      // endgültig, egal welcher Lauf ihn gemeldet hat.
      onFehler: (meldung, code) => {
        if (beendet) return;
        if (ENDGUELTIGE_FEHLER.has(code)) {
          optionen.onFehler(`${meldung} Das Gespräch ist damit beendet.`, true);
          beenden();
          return;
        }
        // „Nichts gehört" ist im Gespräch der Normalfall und keine Meldung wert.
        if (code !== 'no-speech' && meldung) optionen.onFehler(meldung);
      },
      onEnde: () => {
        // Die Browsererkennung endet von selbst; im Gespräch fangen wir
        // einfach wieder an -- aber nicht endlos, wenn dabei nie etwas ankommt.
        if (beendet || veraltet() || zustand === 'denkt') return;
        leerstarts += 1;
        if (leerstarts > MAX_LEERSTARTS) {
          optionen.onFehler('Die Spracherkennung liefert nichts. Bitte tippen Sie Ihre Anweisung.', true);
          beenden();
          return;
        }
        window.setTimeout(hoerenStarten, 150);
      },
    });

    if (!diktat) {
      optionen.onFehler('Dieses System bietet keine Spracherkennung im Fenster an.', true);
      beenden();
      return;
    }
    diktat.start();
    setze('hoert');
    stilleNeuStarten();
  };

  const beenden = () => {
    if (beendet) return;
    beendet = true;
    if (stilleTimer) window.clearTimeout(stilleTimer);
    if (sendeTimer) window.clearTimeout(sendeTimer);
    diktat?.stop();
    diktat = null;
    schweig();
    setze('schlafend');
  };

  // Los geht's: erst melden, dann zuhören.
  void (async () => {
    setze('spricht');
    const eroeffnung = await optionen.eroeffnung();
    if (beendet) return;
    optionen.onGesagt('jarvis', eroeffnung);
    sprich(eroeffnung, { unterbrechen: true });
    // Kurz warten, damit die eigene Stimme nicht als Eingabe ankommt.
    window.setTimeout(hoerenStarten, 700);
  })();

  return { beenden, zustand: () => zustand };
}
