/**
 * Felder aus einem FormData lesen.
 *
 * `FormData.get()` liefert drei verschiedene Dinge: den Wert, `null` wenn das
 * Feld gar nicht mitgeschickt wurde, und ein `File` bei Datei-Feldern. Für eine
 * Prüfung mit Zod ist nur der erste Fall brauchbar — `null` ist dort kein
 * fehlender Wert, sondern ein falscher Typ, und die Meldung lautet dann
 * „Expected string, received null" statt dessen, was der Mensch davor lesen
 * soll.
 *
 * Das ist kein erfundener Fall: Das Feld für den zweiten Faktor steht erst im
 * zweiten Schritt im Formular. Beim ersten Absenden gibt es es nicht — und
 * damit war die Anmeldung für alle unmöglich.
 */

/** Der Wert des Feldes, oder `undefined`, wenn es fehlt oder eine Datei ist. */
export function feld(formData: FormData, name: string): string | undefined {
  const wert = formData.get(name);
  return typeof wert === 'string' ? wert : undefined;
}

/** Wie `feld`, aber nie `undefined` — für Pflichtfelder, die Zod selbst prüft. */
export function pflichtfeld(formData: FormData, name: string): string {
  return feld(formData, name) ?? '';
}
