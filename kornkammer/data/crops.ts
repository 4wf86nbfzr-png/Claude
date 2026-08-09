export type Crop = {
  name: string
  /** Wann die Kultur das Feld praegt — als Wort, nicht als Datum */
  season: string
  role: string
  note: string
}

/**
 * Die Fruchtfolge, erzaehlt als Abfolge von Aufgaben.
 * Bewusst ohne Prozentangaben oder Flaechenzahlen: dazu liegen keine
 * belastbaren Werte vor, und Schmuckziffern will die Seite ohnehin nicht.
 */
export const CROPS: Crop[] = [
  {
    name: 'Winterweizen',
    season: 'Herbstsaat',
    role: 'Brotgetreide',
    note: 'Steht über Winter, nutzt die Feuchte im Frühjahr und trägt den größten Teil der Mehlernte.',
  },
  {
    name: 'Dinkel',
    season: 'Herbstsaat',
    role: 'Brotgetreide',
    note: 'Kommt mit weniger Nährstoff aus als Weizen und verzeiht dem Boden eine schwächere Vorfrucht.',
  },
  {
    name: 'Hafer',
    season: 'Frühjahrssaat',
    role: 'Gesundungsfrucht',
    note: 'Unterbricht Krankheitskreisläufe im Getreide und hinterlässt eine gut durchwurzelte Krume.',
  },
  {
    name: 'Roggen',
    season: 'Herbstsaat',
    role: 'Brotgetreide',
    note: 'Die robusteste Halmfrucht im Betrieb. Beschattet früh und hält Beikraut selbst in Schach.',
  },
  {
    name: 'Kartoffeln',
    season: 'Frühjahrssaat',
    role: 'Hackfrucht',
    note: 'Wird mechanisch gepflegt. Der häufige Durchgang lockert den Boden und hält ihn beikrautfrei.',
  },
  {
    name: 'Senf',
    season: 'Zwischenfrucht',
    role: 'Bodendecker',
    note: 'Deckt den Boden nach der Ernte, verhindert Erosion und liefert die Saat für die eigene Manufaktur.',
  },
  {
    name: 'Raps',
    season: 'Herbstsaat',
    role: 'Ölfrucht',
    note: 'Die Basis für Ruhrtalgold. Tiefe Pfahlwurzel, die verdichtete Schichten aufbricht.',
  },
  {
    name: 'Rotklee',
    season: 'Mehrjährig',
    role: 'Stickstoffsammler',
    note: 'Bindet Stickstoff aus der Luft und macht ihn den Folgefrüchten verfügbar. Ersetzt den Mineraldünger.',
  },
  {
    name: 'Blaumohn',
    season: 'Frühjahrssaat',
    role: 'Ölfrucht',
    note: 'Anspruchsvoll in der Pflege, dafür eine Kultur, die im Revier kaum jemand sonst stehen hat.',
  },
]
