import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Dauerhafte Ablage für die Bedieneinstellungen.
 *
 * Warum das wichtig ist: Wer 200 Prozent Schrift, hohen Kontrast oder
 * Gebärdensprache braucht, darf das nicht bei jedem Start neu einstellen
 * müssen. Die Einstellungen gehören zur Person, nicht zur Sitzung.
 *
 * Alles ist gegen Fehler abgesichert: In einer Datei-Fassung oder in einem
 * privaten Fenster kann der Speicher gesperrt sein. Dann läuft die App
 * weiter, nur eben ohne Gedächtnis -- statt abzustürzen.
 */
const SCHLUESSEL = 'helpmate.bedienhilfen.v1';

export async function ladeEinstellungen<T>(): Promise<Partial<T> | null> {
  try {
    const roh = await AsyncStorage.getItem(SCHLUESSEL);
    if (!roh) return null;
    const wert: unknown = JSON.parse(roh);
    if (typeof wert !== 'object' || wert === null) return null;
    return wert as Partial<T>;
  } catch {
    return null;
  }
}

export async function speichereEinstellungen(werte: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(SCHLUESSEL, JSON.stringify(werte));
  } catch {
    // Kein Speicher verfügbar. Die App funktioniert trotzdem.
  }
}

export async function vergissEinstellungen(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SCHLUESSEL);
  } catch {
    // siehe oben
  }
}
