export type Etappe = {
  /** Jahreszahl als Inhalt, nicht als Schmuckziffer */
  jahr: string
  titel: string
  /** Ein Satz Einordnung. Nur, wo sich etwas belegen laesst. */
  note?: string
  image?: string
  imageAlt?: string
}

/**
 * Betriebsgeschichte.
 *
 * QUELLE: Zeitleiste „Betriebsgeschichte“ des Betriebs. Die Jahreszahlen und
 * Ereignisse stehen genau so darin. Die erlaeuternden Saetze ordnen ein, was
 * das jeweilige Ereignis fachlich bedeutet, und fuegen keine Angaben hinzu,
 * die nicht in der Quelle stehen.
 */
export const GESCHICHTE: Etappe[] = [
  {
    jahr: '1987',
    titel: 'Gründung als Gemischtbetrieb mit zehn Hektar',
    note: 'Zehn Hektar sind wenig. Alles, was danach kam, ist auf dieser Fläche entschieden worden.',
    image: '/images/geschichte/erste-jahre.webp',
    imageAlt: 'Schlepper mit Hackgerät zwischen den Reihen eines Feldes',
  },
  {
    jahr: '1987',
    titel: 'Beitritt zum Bioland Verband',
    note: 'Umgestellt wurde nicht eine Fläche, sondern der Betrieb. Im selben Jahr wie die Gründung.',
  },
  {
    jahr: '1993',
    titel: 'Zupachtung des ehemaligen Rittergutes Haus Holte in Dortmund',
    image: '/images/geschichte/haus-holte.webp',
    imageAlt: 'Luftbild der Hofanlage Haus Holte mit Wirtschaftsgebäuden',
  },
  {
    jahr: '1996',
    titel: 'Kooperation mit dem konventionellen Ackerbaubetrieb Pawliczek',
    image: '/images/geschichte/gruender.webp',
    imageAlt: 'Zwei Landwirte in einem Getreidebestand',
  },
  {
    jahr: '1996',
    titel: 'Gründung der Kornkammer Haus Holte GbR',
  },
  {
    jahr: '2008',
    titel: 'Erweiterung um die Hofstelle Witten-Gedern mit Getreidelager und Aufbereitung',
    note: 'Mit Lager und Aufbereitung bleibt die Wertschöpfung nach dem Drusch am Hof, statt mit der Rohware wegzugehen.',
    image: '/images/geschichte/witten-gedern.webp',
    imageAlt: 'Die Hofstelle Witten-Gedern mit Silos und Halle im Herbst',
  },
]
