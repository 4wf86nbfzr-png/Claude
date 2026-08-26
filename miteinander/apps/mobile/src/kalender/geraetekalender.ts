import { Platform, Share } from 'react-native';
import type { Booking } from '@miteinander/core';

/**
 * Übergabe an den Kalender des Geräts.
 *
 * Diese Datei ist bewusst die einzige Stelle mit Plattformwissen. Der Inhalt
 * des Eintrags kommt aus dem Kern (kalender/ics.ts) und ist dort getestet.
 *
 * Stand:
 *  - Web: Die .ics-Datei wird heruntergeladen. Jeder Kalender kann sie öffnen.
 *  - iOS und Android: Die Datei wird über das Teilen-Menü übergeben; von dort
 *    nimmt sie der Kalender an. Ein direkter Schreibzugriff über
 *    expo-calendar ist vorbereitet, aber noch nicht angebunden -- er braucht
 *    eine Kalenderberechtigung, und die wollen wir erst erfragen, wenn sie
 *    wirklich gebraucht wird.
 */
export interface KalenderErgebnis {
  erfolgreich: boolean;
  meldung: string;
}

/** Lädt einen Text als Datei herunter. Nur im Browser möglich. */
function ladeHerunter(dateiname: string, inhalt: string): boolean {
  // Die Web-APIs sind in den React-Native-Typen nicht bekannt. Der Umweg
  // ueber unknown ist hier ehrlicher als ein globales any.
  const g = globalThis as unknown as {
    document?: {
      createElement: (tag: string) => Record<string, unknown> & { click: () => void };
      body: { appendChild: (el: unknown) => void; removeChild: (el: unknown) => void };
    };
    URL?: { createObjectURL: (b: unknown) => string; revokeObjectURL: (u: string) => void };
    Blob?: new (teile: string[], optionen: { type: string }) => unknown;
  };
  if (!g.document || !g.URL || !g.Blob) return false;
  try {
    const blob = new g.Blob([inhalt], { type: 'text/calendar;charset=utf-8' });
    const url = g.URL.createObjectURL(blob);
    const a = g.document.createElement('a');
    a.href = url;
    a.download = dateiname;
    g.document.body.appendChild(a);
    a.click();
    g.document.body.removeChild(a);
    g.URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function teileDatei(dateiname: string, inhalt: string): Promise<KalenderErgebnis> {
  if (Platform.OS === 'web') {
    return ladeHerunter(dateiname, inhalt)
      ? {
          erfolgreich: true,
          meldung: `Die Datei ${dateiname} wurde heruntergeladen. Öffnen Sie sie, um die Termine in Ihren Kalender zu übernehmen.`,
        }
      : {
          erfolgreich: false,
          meldung: 'Der Browser lässt den Download hier nicht zu. Nutzen Sie die App auf dem Handy.',
        };
  }
  try {
    await Share.share({ title: dateiname, message: inhalt });
    return {
      erfolgreich: true,
      meldung: 'Wählen Sie im Menü Ihren Kalender aus, um den Termin zu übernehmen.',
    };
  } catch {
    return { erfolgreich: false, meldung: 'Das Teilen wurde abgebrochen.' };
  }
}

export async function legeInKalender(booking: Booking, ics: string): Promise<KalenderErgebnis> {
  return teileDatei(`einsatz-${booking.id}.ics`, ics);
}
