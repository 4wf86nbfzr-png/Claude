export type Station = {
  /** Wortmarke statt Ziffer — die Reihenfolge traegt die Typografie */
  mark: string
  title: string
  body: string
  media: string
  mediaAlt: string
}

/** Die gepinnte Story „Vom Boden auf den Teller“. */
export const STATIONS: Station[] = [
  {
    mark: 'Boden',
    title: 'Alles beginnt unter der Oberfläche',
    body: 'Ein lebendiger Boden ist kein Substrat, sondern ein Bestand. Wir füttern ihn mit organischer Substanz und halten ihn bedeckt, damit Regen ihn nicht abträgt und Sonne ihn nicht ausbrennt.',
    media: '/images/story/boden.jpg',
    mediaAlt: 'Nahaufnahme von krümeliger, dunkler Ackererde',
  },
  {
    mark: 'Saat',
    title: 'Die Reihenfolge entscheidet',
    body: 'Was wir säen, hängt davon ab, was vorher stand. Nach dem Klee kommt die zehrende Frucht, nach dem Getreide die Wurzel, die den Boden aufbricht. Die Fruchtfolge ist der eigentliche Pflanzenschutz.',
    media: '/images/story/saat.jpg',
    mediaAlt: 'Sämaschine bei der Arbeit in der Dämmerung',
  },
  {
    mark: 'Wachstum',
    title: 'Zeit ist ein Betriebsmittel',
    body: 'Ohne leicht lösliche Dünger wächst ein Bestand langsamer und gleichmäßiger. Das kostet Ertrag und bringt Standfestigkeit. Wir haben uns für die zweite Variante entschieden.',
    media: '/images/story/wachstum.jpg',
    mediaAlt: 'Junger Getreidebestand im Morgenlicht',
  },
  {
    mark: 'Pflege',
    title: 'Der Striegel statt der Spritze',
    body: 'Beikraut regulieren wir mechanisch. Striegel und Hacke fahren zum richtigen Zeitpunkt, nicht zum bequemen. Wer den Termin verpasst, hat das Jahr über ein Problem.',
    media: '/images/story/pflege.jpg',
    mediaAlt: 'Hackgerät zwischen Pflanzenreihen',
  },
  {
    mark: 'Ernte',
    title: 'Wenige Tage entscheiden über das Jahr',
    body: 'Getreide wartet nicht. Ist es reif, wird gedroschen, notfalls nachts. Das Bild, mit dem diese Seite anfängt, ist genau so entstanden.',
    media: '/images/story/ernte.jpg',
    mediaAlt: 'Erntemaschine bei Nacht mit Scheinwerfern',
  },
  {
    mark: 'Verarbeitung',
    title: 'Wertschöpfung bleibt am Hof',
    body: 'Mahlen, pressen, abfüllen. Was früher als Rohware wegging, verlässt den Hof heute als Mehl, Öl, Nudel oder Senf. Das macht uns unabhängiger vom Rohstoffpreis.',
    media: '/images/story/verarbeitung.jpg',
    mediaAlt: 'Mehl läuft aus der Mühle in einen Sack',
  },
  {
    mark: 'Produkt',
    title: 'Am Ende steht ein Glas auf dem Tisch',
    body: 'Und man kann sagen, auf welchem Schlag es gewachsen ist. Genau dafür führen wir die ganze Kette selbst.',
    media: '/images/story/produkt.jpg',
    mediaAlt: 'Fertige Produkte auf einem Holztisch',
  },
]
