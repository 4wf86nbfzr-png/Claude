/**
 * Untertitel.
 *
 * Bewusst nicht als eingebrannte Schrift im Video und auch nicht als
 * Untertitelspur des Betriebssystems, sondern als eigene Ebene:
 *
 *  - Die Schriftgroesse folgt der Einstellung der Nutzenden. Eine
 *    eingebrannte Zeile bliebe winzig, egal was jemand eingestellt hat.
 *  - Kontrast und Farbe kommen aus dem Design-System und wechseln im
 *    Hochkontrastmodus mit.
 *  - Der gleiche Text traegt Untertitel, Transkript und Vorlesefunktion.
 *
 * Quelle ist WebVTT, damit produzierte Videos ihre Untertiteldatei
 * unveraendert mitbringen koennen.
 */

export interface Untertitelzeile {
  /** Startzeit in Sekunden. */
  von: number;
  /** Endzeit in Sekunden. */
  bis: number;
  text: string;
}

/** "00:00:03.500" oder "00:03.500" -> Sekunden. */
export function parseZeitstempel(wert: string): number {
  const teile = wert.trim().split(':');
  if (teile.length < 2 || teile.length > 3) {
    throw new Error(`Ungültiger Zeitstempel: ${wert}`);
  }
  const sekunden = Number.parseFloat((teile.pop() ?? '0').replace(',', '.'));
  const minuten = Number.parseInt(teile.pop() ?? '0', 10);
  const stunden = teile.length > 0 ? Number.parseInt(teile[0] ?? '0', 10) : 0;
  if (Number.isNaN(sekunden) || Number.isNaN(minuten) || Number.isNaN(stunden)) {
    throw new Error(`Ungültiger Zeitstempel: ${wert}`);
  }
  return stunden * 3600 + minuten * 60 + sekunden;
}

const ZEITZEILE = /^(.+?)\s*-->\s*(.+?)(?:\s+.*)?$/;

/**
 * Liest eine WebVTT-Datei.
 *
 * Unterstuetzt wird, was fuer Untertitel gebraucht wird: Kopfzeile,
 * optionale Bezeichner, Zeitzeilen und mehrzeilige Texte. Kommentarbloecke
 * (NOTE) und Stilbloecke (STYLE) werden uebersprungen.
 */
export function parseWebVtt(quelle: string): Untertitelzeile[] {
  const zeilen: Untertitelzeile[] = [];
  const bloecke = quelle
    .replace(/\r\n/g, '\n')
    // Byte Order Mark am Dateianfang entfernen
    .replace(/^\uFEFF/, '')
    .split(/\n{2,}/);

  for (const block of bloecke) {
    const inhalt = block.trim();
    if (!inhalt) continue;
    if (/^WEBVTT/.test(inhalt)) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(inhalt)) continue;

    const teile = inhalt.split('\n');
    const zeitIndex = teile.findIndex((z) => ZEITZEILE.test(z) && z.includes('-->'));
    if (zeitIndex === -1) continue;

    const treffer = ZEITZEILE.exec(teile[zeitIndex] ?? '');
    if (!treffer) continue;

    const text = teile
      .slice(zeitIndex + 1)
      .join('\n')
      // Einfache WebVTT-Auszeichnungen entfernen; wir setzen selbst.
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!text) continue;

    try {
      const von = parseZeitstempel(treffer[1] ?? '');
      const bis = parseZeitstempel(treffer[2] ?? '');
      if (bis > von) zeilen.push({ von, bis, text });
    } catch {
      // Eine kaputte Zeile darf nicht die ganze Datei unbrauchbar machen.
      continue;
    }
  }

  return zeilen.sort((a, b) => a.von - b.von);
}

/** Welche Zeile gehoert zu diesem Zeitpunkt? */
export function aktiveZeile(
  zeilen: readonly Untertitelzeile[],
  sekunde: number,
): Untertitelzeile | undefined {
  return zeilen.find((z) => sekunde >= z.von && sekunde < z.bis);
}

/** Erzeugt WebVTT aus Zeilen -- fuer Ausgabe und fuer den Platzhalter-Bau. */
export function zuWebVtt(zeilen: readonly Untertitelzeile[]): string {
  const zeit = (sekunden: number) => {
    const s = Math.max(0, sekunden);
    const std = Math.floor(s / 3600);
    const min = Math.floor((s % 3600) / 60);
    const sek = s % 60;
    return `${String(std).padStart(2, '0')}:${String(min).padStart(2, '0')}:${sek.toFixed(3).padStart(6, '0')}`;
  };
  const bloecke = zeilen.map((z, i) => `${i + 1}\n${zeit(z.von)} --> ${zeit(z.bis)}\n${z.text}`);
  return ['WEBVTT', '', ...bloecke].join('\n\n') + '\n';
}

/**
 * Baut aus Saetzen gleichmaessig getaktete Untertitel.
 * Wird fuer die gekennzeichneten Platzhaltervideos genutzt.
 */
export function zeilenAusSaetzen(saetze: readonly string[], sekundenProSatz = 3): Untertitelzeile[] {
  return saetze.map((text, i) => ({
    von: i * sekundenProSatz,
    bis: (i + 1) * sekundenProSatz,
    text,
  }));
}

/** Laufzeit als "0:07" -- fuer die Anzeige am Abspieler. */
export function formatiereLaufzeit(sekunden: number): string {
  const gesamt = Math.max(0, Math.floor(sekunden));
  const min = Math.floor(gesamt / 60);
  const sek = gesamt % 60;
  return `${min}:${String(sek).padStart(2, '0')}`;
}

/** Das Transkript ist der volle Text -- unabhaengig von der Wiedergabe lesbar. */
export function transkriptAusZeilen(zeilen: readonly Untertitelzeile[]): string {
  return zeilen.map((z) => z.text).join(' ');
}
