import type { Jarvis } from '../jarvis.js';

/**
 * Bereitschaftsbericht für die Konsole.
 *
 * Bewusst ein eigenes Modul ohne Einstiegspunkt: sowohl der
 * Einrichtungsassistent als auch die CLI importieren ihn, und beim Import
 * darf nichts von selbst losgehen.
 *
 * Rückgabe: true, wenn alles Pflichtige eingerichtet ist.
 */
export function berichte(jarvis: Jarvis): boolean {
  const s = jarvis.status();
  let allesBereit = true;

  const zeile = (titel: string, bereit: boolean, wert: string, hinweis: string | null, pflicht = true) => {
    if (!bereit && pflicht) allesBereit = false;
    console.log(`  ${bereit ? '✓' : '✗'} ${titel.padEnd(18)} ${wert}`);
    if (hinweis) console.log(`    ↳ ${hinweis}`);
  };

  zeile(
    'Sprachmodell',
    s.sprachmodell.bereit,
    `${s.sprachmodell.anbieter}/${s.sprachmodell.modell}`,
    s.sprachmodell.hinweis,
  );
  zeile('Websuche', !s.suche.hinweis, s.suche.anbieter, s.suche.hinweis);
  zeile('Versandweg', s.versand.bereit, s.versand.label, s.versand.hinweis);
  zeile('Posteingang', s.posteingang.bereit, s.posteingang.anbieter, s.posteingang.hinweis, false);
  zeile('Spracheingabe', s.spracheingabe.bereit, s.spracheingabe.provider, s.spracheingabe.hinweis, false);
  zeile('Sprachausgabe', s.sprachausgabe.bereit, s.sprachausgabe.provider, s.sprachausgabe.hinweis, false);
  zeile(
    'Kalender',
    s.kalender.bereit,
    s.kalender.anbieter,
    s.kalender.bereit ? null : 'Optional: ICS-Adresse in den Einstellungen hinterlegen.',
    false,
  );

  console.log('');
  console.log(
    `  Versandlimits: ${s.versandlimits.maxPerHour}/Stunde, ${s.versandlimits.maxPerDay}/Tag, ` +
      `Mindestabstand ${s.versandlimits.minIntervalSeconds} s`,
  );
  console.log(
    `  Empfänger:     ${s.versandlimits.requireVerifiedRecipient ? 'nur verifizierte Adressen' : 'auch unverifizierte (nicht empfohlen)'}`,
  );
  console.log(`  Dateizugriff:  ${s.verzeichnisse.join(', ')}`);
  console.log('');

  return allesBereit;
}

/**
 * Läuft dieses Modul als Programm oder wurde es nur importiert?
 * Der Vergleich über den aufgelösten Pfad ist die verlässliche Fassung --
 * ein Vergleich auf den Dateinamen trifft auch beim blossen Import zu.
 */
export async function istEinstiegspunkt(moduleUrl: string): Promise<boolean> {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const { resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  try {
    return pathToFileURL(resolve(argv1)).href === moduleUrl;
  } catch {
    return false;
  }
}
