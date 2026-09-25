import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Verschlüsselung für besonders schutzwürdige Felder (SecPlan 15, Art. 32
 * Abs. 1 lit. a DSGVO).
 *
 * AES-256-GCM: verschlüsselt und erkennt zugleich Veränderungen. Der
 * Schlüssel kommt aus der Umgebung und steht nirgends im Quelltext.
 *
 * Bewusst KEIN stiller Rückfall auf Klartext, wenn der Schlüssel fehlt.
 * Ein Feld, das mal verschlüsselt und mal nicht abgelegt wird, ist
 * schlimmer als eins, das gar nicht angelegt werden kann – deshalb wirft
 * es hier einen Fehler, den man beim Einrichten sofort sieht.
 */

const KENNUNG = 'v1';

let zwischenspeicher: Buffer | null = null;

/** Leitet den 32-Byte-Schlüssel aus DATA_ENCRYPTION_KEY ab. */
function schluessel(): Buffer {
  if (zwischenspeicher) return zwischenspeicher;
  const roh = process.env.DATA_ENCRYPTION_KEY;
  if (!roh || roh.length < 32) {
    throw new Error(
      'DATA_ENCRYPTION_KEY fehlt oder ist zu kurz (mindestens 32 Zeichen). '
      + 'Ohne diesen Schlüssel lassen sich besondere Kategorien nach Art. 9 DSGVO nicht speichern.',
    );
  }
  // Fester Salzwert: der Schlüssel selbst ist das Geheimnis, das Salz
  // sorgt nur dafür, dass aus derselben Zeichenkette immer derselbe
  // Schlüssel entsteht – sonst wäre nichts mehr zu entschlüsseln.
  zwischenspeicher = scryptSync(roh, 'hst-planer-feldverschluesselung', 32);
  return zwischenspeicher;
}

/** Ist ein Schlüssel hinterlegt? Für Hinweise in der Oberfläche. */
export function verschluesselungBereit(): boolean {
  const roh = process.env.DATA_ENCRYPTION_KEY;
  return Boolean(roh && roh.length >= 32);
}

/**
 * Verschlüsselt einen Text. Das Ergebnis trägt Kennung, Nonce und
 * Prüfsumme mit, damit es sich später ohne Zusatzwissen lesen lässt:
 *   v1:<nonce base64>:<tag base64>:<inhalt base64>
 */
export function verschluesseln(klartext: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', schluessel(), nonce);
  const inhalt = Buffer.concat([cipher.update(klartext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [KENNUNG, nonce.toString('base64'), tag.toString('base64'), inhalt.toString('base64')].join(':');
}

/**
 * Entschlüsselt einen Wert. Wurde er verändert, schlägt das fehl – das
 * ist gewollt: lieber ein Fehler als ein still verfälschter Inhalt.
 */
export function entschluesseln(gespeichert: string): string {
  const teile = gespeichert.split(':');
  if (teile.length !== 4 || teile[0] !== KENNUNG) {
    throw new Error('Der gespeicherte Wert hat nicht das erwartete Format.');
  }
  const [, nonce, tag, inhalt] = teile as [string, string, string, string];
  const decipher = createDecipheriv('aes-256-gcm', schluessel(), Buffer.from(nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(inhalt, 'base64')), decipher.final()]).toString('utf8');
}

/** Nur für Tests: erzwingt, dass der Schlüssel neu abgeleitet wird. */
export function schluesselVergessen(): void {
  zwischenspeicher = null;
}
