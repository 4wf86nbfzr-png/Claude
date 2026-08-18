import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { err, ok, type Result } from '../util/result.js';
import { WHISPER_ABTASTRATE } from './segmente.js';

const ausfuehren = promisify(execFile);

/**
 * Eine echte Probe für die Spracherkennung — ohne Mikrofon.
 *
 * Der Trick: das Betriebssystem kann sprechen. macOS bringt `say` mit, viele
 * Linux-Systeme `espeak`. Damit lässt sich ein bekannter Satz in Abtastwerte
 * verwandeln und durch die Erkennung schicken. Kommt derselbe Satz zurück,
 * ist die ganze Kette geprüft: Modell geladen, Laufzeit in Ordnung, Deutsch
 * verstanden.
 *
 * Das ist der Unterschied zwischen „ist installiert" und „funktioniert". Bei
 * einer Einrichtung, die einige hundert Megabyte lädt, will man das wissen,
 * bevor man im Gespräch feststellt, dass nichts ankommt.
 */

export interface Sprachprobe {
  pcm: Float32Array;
  satz: string;
  werkzeug: string;
}

/** Der Probesatz. Enthält Umlaute, eine Zahl und ein Fachwort. */
export const PROBESATZ = 'Moin, hier spricht Jarvis. Bitte leg vier Entwürfe für die Hafenlogistik an.';

/**
 * Lässt das System den Probesatz sprechen und liefert die Abtastwerte.
 *
 * Auf macOS schreibt `say` direkt 32-Bit-Fließkomma bei 16 kHz — genau das
 * Format, das Whisper erwartet, ohne Umrechnung.
 */
export async function spracheVomSystem(satz = PROBESATZ): Promise<Result<Sprachprobe>> {
  const ordner = mkdtempSync(join(tmpdir(), 'jarvis-probe-'));
  const ziel = join(ordner, 'probe.raw');

  try {
    if (process.platform === 'darwin') {
      await ausfuehren('say', [
        '-v',
        'Anna',
        '--data-format=LEF32@16000',
        '--file-format=caff',
        '-o',
        ziel,
        satz,
      ]).catch(async () => {
        // Nicht auf jedem Mac ist die Stimme „Anna" installiert.
        await ausfuehren('say', ['--data-format=LEF32@16000', '--file-format=caff', '-o', ziel, satz]);
      });
      return ok({ pcm: rohAusCaff(readFileSync(ziel)), satz, werkzeug: 'say (macOS)' });
    }

    if (process.platform === 'linux') {
      await ausfuehren('espeak-ng', ['-v', 'de', '-s', '150', '-w', ziel, satz]).catch(() =>
        ausfuehren('espeak', ['-v', 'de', '-s', '150', '-w', ziel, satz]),
      );
      return ok({ pcm: pcm16AusWav(readFileSync(ziel)), satz, werkzeug: 'espeak' });
    }

    return err('NOT_IMPLEMENTED', `Auf ${process.platform} gibt es hier keine Sprachausgabe für die Probe.`);
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    return err('NOT_CONFIGURED', `Das System konnte den Probesatz nicht sprechen: ${meldung}`, {
      hint:
        process.platform === 'linux'
          ? 'espeak-ng installieren, oder die Probe überspringen.'
          : 'Ohne Sprachausgabe lässt sich die Erkennung nur im laufenden Betrieb prüfen.',
    });
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
}

/**
 * Holt die Abtastwerte aus einer CAF-Datei.
 *
 * Wir suchen den `data`-Abschnitt, statt den Kopf durchzurechnen: CAF erlaubt
 * beliebig viele Abschnitte in beliebiger Reihenfolge, und `say` schreibt je
 * nach Version unterschiedlich viele davon.
 */
function rohAusCaff(datei: Buffer): Float32Array {
  // Ab Byte 8 suchen: davor steht nur der Dateikopf.
  const marke = datei.indexOf('data', 8, 'ascii');
  if (marke < 0) throw new Error('Die Audiodatei enthält keinen data-Abschnitt.');
  // 4 Byte Kennung, 8 Byte Länge, 4 Byte „edit count" -- dann die Werte.
  const start = marke + 16;
  const anzahl = Math.floor((datei.length - start) / 4);
  const werte = new Float32Array(anzahl);
  for (let i = 0; i < anzahl; i += 1) {
    // `say` schreibt Little Endian (LEF32).
    werte[i] = datei.readFloatLE(start + i * 4);
  }
  return werte;
}

/** Holt die Abtastwerte aus einer WAV-Datei mit 16-Bit-Ganzzahlen. */
function pcm16AusWav(datei: Buffer): Float32Array {
  const marke = datei.indexOf('data', 12, 'ascii');
  if (marke < 0) throw new Error('Die Audiodatei enthält keinen data-Abschnitt.');
  const laenge = datei.readUInt32LE(marke + 4);
  const start = marke + 8;
  const anzahl = Math.floor(Math.min(laenge, datei.length - start) / 2);
  const werte = new Float32Array(anzahl);
  for (let i = 0; i < anzahl; i += 1) werte[i] = datei.readInt16LE(start + i * 2) / 32_768;

  // espeak schreibt 22.05 kHz -- Whisper will 16 kHz.
  const rate = datei.readUInt32LE(datei.indexOf('fmt ', 12, 'ascii') + 12);
  return rate === WHISPER_ABTASTRATE ? werte : einfachUmrechnen(werte, rate, WHISPER_ABTASTRATE);
}

/**
 * Grobe Umrechnung der Abtastrate für die Probe.
 *
 * Bewusst schlicht: hier geht es nur darum, ob die Erkennung überhaupt läuft.
 * Im Betrieb rechnet das Fenster mit Web Audio um, das den nötigen Tiefpass
 * mitbringt.
 */
function einfachUmrechnen(werte: Float32Array, von: number, nach: number): Float32Array {
  const laenge = Math.round((werte.length * nach) / von);
  const ziel = new Float32Array(laenge);
  for (let i = 0; i < laenge; i += 1) {
    const quelle = (i * von) / nach;
    const a = Math.floor(quelle);
    const anteil = quelle - a;
    ziel[i] = (werte[a] ?? 0) * (1 - anteil) + (werte[a + 1] ?? 0) * anteil;
  }
  return ziel;
}

/**
 * Wie gut deckt sich das Erkannte mit dem Gesprochenen?
 *
 * Wortweise und nachsichtig: Whisper setzt andere Satzzeichen, schreibt Zahlen
 * aus und trifft Eigennamen selten genau. Für die Frage „funktioniert die
 * Erkennung überhaupt" ist das gleichgültig.
 */
export function trefferquote(erwartet: string, erkannt: string): number {
  const soll = zerlege(erwartet);
  const ist = new Set(zerlege(erkannt));
  if (soll.length === 0) return 0;
  return soll.filter((w) => ist.has(w)).length / soll.length;
}

function zerlege(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}
