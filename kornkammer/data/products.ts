export type Product = {
  slug: string
  name: string
  /** Kurzer Beiname, erscheint als Utility-Zeile ueber dem Namen */
  eyebrow: string
  /** Ein Satz, der im horizontalen Lauf steht */
  line: string
  /** Fliesstext der Detailseite */
  body: string[]
  /** Stichpunkte, bewusst ohne Nummerierung */
  facts: string[]
  /** Bildplatzhalter bis echtes Material vorliegt */
  image: string
  imageAlt: string
  /** Grundton der Sektion */
  tone: 'soil' | 'paper'
}

export const PRODUCTS: Product[] = [
  {
    slug: 'kartoffeln',
    name: 'Kartoffeln',
    eyebrow: 'Aus dem Revier',
    line: 'Gewachsen im Lehm des Ruhrtals, geerntet, wenn die Schale fest ist.',
    body: [
      'Kartoffeln sind die Kultur, an der man einen Boden am schnellsten abliest. Wer sie über Jahre auf denselben Flächen zieht, merkt es an der Knolle. Deshalb stehen sie bei uns in einer weiten Fruchtfolge und kommen erst zurück, wenn der Schlag Zeit hatte.',
      'Wir ernten von Hand nach, sortieren am Hof und lagern kühl statt chemisch keimgehemmt. Was in den Hofverkauf geht, ist Ware, die wir selbst kochen würden.',
    ],
    facts: [
      'Anbau nach Bioland Richtlinien',
      'Mechanische Beikrautregulierung statt Herbizid',
      'Lagerung ohne chemische Keimhemmung',
      'Verkauf direkt ab Hof',
    ],
    image: '/images/produkte/kartoffeln.jpg',
    imageAlt: 'Frisch geerntete Kartoffeln auf dunkler Erde',
    tone: 'soil',
  },
  {
    slug: 'getreide',
    name: 'Getreide',
    eyebrow: 'Korn und Mehl',
    line: 'Winterweizen, Dinkel, Hafer und Roggen. Vermahlen, nicht nur verkauft.',
    body: [
      'Lange ging unser Korn als Rohware weg und die Wertschöpfung fand woanders statt. Heute vermahlen wir einen wachsenden Teil selbst und beliefern Bäckereien in der Region mit Biomehl.',
      'Der Unterschied liegt in der Rückverfolgbarkeit: Wer bei uns Mehl kauft, kann den Schlag benennen, auf dem es gewachsen ist.',
    ],
    facts: [
      'Winterweizen, Dinkel, Hafer und Roggen aus eigenem Anbau',
      'Vermahlung in Bioland Qualität',
      'Belieferung von Bäckereien in der Region',
      'Ganze Körner und Mehle im Hofverkauf',
    ],
    image: '/images/produkte/getreide.jpg',
    imageAlt: 'Reife Getreideähren im Gegenlicht',
    tone: 'paper',
  },
  {
    slug: 'speiseoele',
    name: 'Speiseöle',
    eyebrow: 'Ruhrtalgold',
    line: 'Kaltgepresst aus eigener Saat. Der Name steht für die Herkunft, nicht für ein Versprechen.',
    body: [
      'Ruhrtalgold ist unsere Ölmarke. Gepresst wird kalt, damit die Saat ihren Geschmack behält, und in kleinen Partien, damit nichts lange steht.',
      'Raps liefert das Alltagsöl, Blaumohn und weitere Saaten die Öle für den besonderen Moment. Alles wächst in derselben Fruchtfolge, die auch das Getreide trägt.',
    ],
    facts: [
      'Kaltpressung aus eigener Saat',
      'Abfüllung in kleinen Partien',
      'Rapsöl als Alltagsöl, Spezialitäten aus weiteren Saaten',
      'Erhältlich im Hofverkauf und im Onlineshop',
    ],
    image: '/images/produkte/speiseoele.jpg',
    imageAlt: 'Flaschen mit kaltgepresstem Speiseöl',
    tone: 'soil',
  },
  {
    slug: 'nudeln',
    name: 'Nudeln',
    eyebrow: 'Aus eigenem Korn',
    line: 'Der kürzeste Weg vom Schlag auf den Teller, den wir bauen konnten.',
    body: [
      'Nudeln sind die logische Fortsetzung der eigenen Vermahlung. Aus unserem Weizen und Dinkel entsteht Teigware, die wir unter eigenem Namen anbieten.',
      'Damit bleibt ein weiterer Schritt der Wertschöpfung auf dem Hof, statt das Korn anonym in den Handel zu geben.',
    ],
    facts: [
      'Hergestellt aus Getreide aus eigenem Anbau',
      'Weizen und Dinkel als Basis',
      'Erhältlich im Hofverkauf',
    ],
    image: '/images/produkte/nudeln.jpg',
    imageAlt: 'Teigwaren aus eigenem Getreide',
    tone: 'paper',
  },
  {
    slug: 'senf',
    name: 'Senf',
    eyebrow: 'Eigene Senfmanufaktur',
    line: 'Senfsaat steht ohnehin in der Fruchtfolge. Also machen wir Senf daraus.',
    body: [
      'Senf war zuerst eine Zwischenfrucht, die den Boden über den Winter deckt und durchwurzelt. Dass daraus ein Produkt wurde, ist die Art von Umweg, die wir mögen.',
      'In der eigenen Manufaktur entstehen daraus Sorten, die im Hofverkauf und im Onlineshop stehen.',
    ],
    facts: [
      'Senfsaat aus eigener Fruchtfolge',
      'Verarbeitung in der eigenen Manufaktur',
      'Erhältlich im Hofverkauf und im Onlineshop',
    ],
    image: '/images/produkte/senf.jpg',
    imageAlt: 'Senfgläser aus der eigenen Manufaktur',
    tone: 'soil',
  },
]

export function productBySlug(slug: string) {
  return PRODUCTS.find((p) => p.slug === slug)
}
