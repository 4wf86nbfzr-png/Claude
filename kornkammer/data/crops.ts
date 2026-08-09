export type Crop = {
  /** Wie die Kultur im Fruchtfolgeplan des Betriebs steht */
  name: string
  /** Weitere Kulturen, die an dieser Stelle stehen koennen */
  auch?: string[]
  /** Was die Kultur im Boden leistet */
  role: string
  note: string
  image?: string
  imageAlt?: string
}

/**
 * Die Fruchtfolge, wie sie der Betrieb selbst auffuehrt.
 *
 * QUELLE: Uebersicht „Fruchtfolge aktuell“ des Betriebs. Sechs Glieder,
 * beginnend beim Rotklee. Die Reihenfolge ist Inhalt, keine Zierziffer —
 * deshalb steht sie im Layout als Abfolge und nicht als nummerierte Liste.
 *
 * Die Erlaeuterungen zur Wirkung der einzelnen Glieder sind fachliche
 * Einordnung des oekologischen Landbaus, keine Betriebsangaben. Zahlen zu
 * Flaechen oder Ertraegen stehen bewusst nicht darin: dazu liegt nichts vor.
 */
export const CROPS: Crop[] = [
  {
    name: 'Rotklee',
    role: 'Stickstoffsammler',
    note: 'Der erste Aufwuchs wird siliert, der zweite gedroschen. Der Klee bindet Stickstoff aus der Luft und übergibt ihn an die Frucht, die nach ihm kommt. Er ist der Grund, warum auf diesen Flächen kein Mineraldünger nötig ist.',
    image: '/images/fruchtfolge/ernte.webp',
    imageAlt: 'Feldhäcksler bei der Ernte des ersten Aufwuchses',
  },
  {
    name: 'Winterweizen',
    role: 'Brotgetreide',
    note: 'Steht direkt nach dem Klee und holt sich, was dieser hinterlassen hat. Als anspruchsvollste Halmfrucht bekommt der Weizen den besten Platz in der Folge.',
    image: '/images/fruchtfolge/stoppel.webp',
    imageAlt: 'Reifes Getreide kurz vor dem Drusch',
  },
  {
    name: 'Kartoffeln',
    auch: ['Hafer', 'Winterraps'],
    role: 'Hackfrucht oder Ölfrucht',
    note: 'Je nach Schlag und Jahr steht hier eine von drei Kulturen. Kartoffeln werden mechanisch gepflegt, der häufige Durchgang lockert die Krume. Winterraps bricht mit seiner Pfahlwurzel verdichtete Schichten auf, Hafer unterbricht Krankheitskreisläufe im Getreide.',
    image: '/images/fruchtfolge/kartoffeln.webp',
    imageAlt: 'Frisch gehäufelte Kartoffeldämme vor einem Waldrand',
  },
  {
    name: 'Dinkel',
    role: 'Brotgetreide',
    note: 'Kommt mit weniger Nährstoff aus als Weizen und verzeiht dem Boden eine schwächere Vorfrucht. Deshalb steht er an der Stelle, an der die Reserven aus dem Klee zur Neige gehen.',
  },
  {
    name: 'Hafer',
    auch: ['Mohn', 'Senf'],
    role: 'Sommerung',
    note: 'Die Sommerung öffnet ein Zeitfenster für die Beikrautregulierung, das eine Herbstsaat nicht lässt. Blaumohn ist die anspruchsvollste dieser drei und eine Kultur, die im Revier sonst kaum jemand stehen hat.',
    image: '/images/fruchtfolge/mohn.webp',
    imageAlt: 'Blühender Blaumohn in voller Blüte',
  },
  {
    name: 'Dinkel',
    role: 'Brotgetreide',
    note: 'Schließt die Folge ab. Danach beginnt sie von vorn, mit dem Klee, der den Boden wieder auffüllt.',
  },
]
