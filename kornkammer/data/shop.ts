/**
 * Das Sortiment.
 *
 * QUELLENLAGE — bitte lesen, bevor hier etwas ergaenzt wird
 * ---------------------------------------------------------
 * Der bestehende Onlineshop (shopteamkornkammer.company.site) war aus der
 * Bauumgebung nicht erreichbar, der Egress-Filter blockt die Domain. Preise
 * und Gebindegroessen liegen deshalb nicht vor. Sie werden hier NICHT
 * geschaetzt: ein falscher Preis auf einer Verkaufsseite ist kein Schoenheits-
 * fehler, sondern eine Preisangabe, an der man sich messen lassen muss.
 *
 * Solange `preisCent` und `gebinde` auf `null` stehen, zeigt der Shop den
 * Artikel als „Preis auf Anfrage“ und legt ihn auf die Anfrageliste statt in
 * einen Warenkorb. Sobald echte Werte eingetragen sind, rechnet dieselbe
 * Oberflaeche Summen, Grundpreise und Mengen aus. Es ist nichts weiter zu
 * programmieren, nur einzutragen.
 *
 * SO TRAEGT MAN EIN
 *   preisCent: 320        →  3,20 €   (immer in Cent, nie als Kommazahl:
 *                                       0.1 + 0.2 ergibt in JavaScript nicht 0.3)
 *   gebinde:   '1 kg'     →  Gebindegroesse, wie sie auf dem Etikett steht
 *   grundmenge:'kg'       →  Bezugsgroesse fuer den Grundpreis nach PAngV
 *   menge:     1          →  Zahlenwert des Gebindes in der Grundmenge
 *
 * Der Grundpreis („je Kilogramm“) ist bei Lebensmitteln nach der
 * Preisangabenverordnung Pflicht. Er wird unten automatisch berechnet,
 * sobald `preisCent`, `menge` und `grundmenge` gesetzt sind.
 */

export type Variante = {
  id: string
  /** Gebindegroesse als Text, z.B. '1 kg'. `null` = noch nicht belegt. */
  gebinde: string | null
  /** Preis in Cent. `null` = noch nicht belegt. */
  preisCent: number | null
  /** Zahlenwert des Gebindes, bezogen auf `grundmenge`. */
  menge?: number
  /** Bezugsgroesse fuer den Grundpreis. */
  grundmenge?: 'kg' | 'l'
}

export type Artikel = {
  slug: string
  name: string
  /** Sortimentsgruppe, dient als Filter */
  gruppe: string
  /** Ein Satz. Kein Werbetext. */
  kurz: string
  bild: string
  bildAlt: string
  varianten: Variante[]
}

export const GRUPPEN = ['Kartoffeln', 'Getreide und Mehle', 'Speiseöle', 'Nudeln', 'Senf'] as const

export const ARTIKEL: Artikel[] = [
  {
    slug: 'kartoffeln',
    name: 'Kartoffeln',
    gruppe: 'Kartoffeln',
    kurz: 'Mechanisch gepflegt, kühl gelagert, ohne chemische Keimhemmung.',
    bild: '/images/fruchtfolge/kartoffeln.webp',
    bildAlt: 'Kartoffeldämme auf dem Feld',
    varianten: [{ id: 'kartoffeln-1', gebinde: null, preisCent: null, grundmenge: 'kg' }],
  },
  {
    slug: 'mehl',
    name: 'Mehl aus eigener Vermahlung',
    gruppe: 'Getreide und Mehle',
    kurz: 'Weizen und Dinkel vom eigenen Schlag, in Bioland Qualität vermahlen.',
    bild: '/images/fruchtfolge/stoppel.webp',
    bildAlt: 'Reifes Getreide kurz vor dem Drusch',
    varianten: [{ id: 'mehl-1', gebinde: null, preisCent: null, grundmenge: 'kg' }],
  },
  {
    slug: 'getreide',
    name: 'Getreide, ganzes Korn',
    gruppe: 'Getreide und Mehle',
    kurz: 'Winterweizen, Dinkel und Hafer aus der eigenen Fruchtfolge.',
    bild: '/images/fruchtfolge/ernte.webp',
    bildAlt: 'Feldhäcksler bei der Ernte',
    varianten: [{ id: 'getreide-1', gebinde: null, preisCent: null, grundmenge: 'kg' }],
  },
  {
    slug: 'rapsoel',
    name: 'Rapsöl Ruhrtalgold',
    gruppe: 'Speiseöle',
    kurz: 'Kaltgepresst aus eigener Saat, in kleinen Partien abgefüllt.',
    bild: '/images/fruchtfolge/winterraps.webp',
    bildAlt: 'Blühendes Rapsfeld mit Fahrgassen',
    varianten: [{ id: 'rapsoel-1', gebinde: null, preisCent: null, grundmenge: 'l' }],
  },
  {
    slug: 'mohnoel',
    name: 'Mohnöl Ruhrtalgold',
    gruppe: 'Speiseöle',
    kurz: 'Aus Blaumohn, der im fünften Glied der Fruchtfolge steht.',
    bild: '/images/fruchtfolge/mohn.webp',
    bildAlt: 'Blühender Blaumohn',
    varianten: [{ id: 'mohnoel-1', gebinde: null, preisCent: null, grundmenge: 'l' }],
  },
  {
    slug: 'nudeln',
    name: 'Nudeln',
    gruppe: 'Nudeln',
    kurz: 'Teigware aus eigenem Weizen und Dinkel.',
    bild: '/images/produkte/nudeln.jpg',
    bildAlt: 'Teigwaren aus eigenem Getreide',
    varianten: [{ id: 'nudeln-1', gebinde: null, preisCent: null, grundmenge: 'kg' }],
  },
  {
    slug: 'senf',
    name: 'Senf aus eigener Manufaktur',
    gruppe: 'Senf',
    kurz: 'Aus Senfsaat, die ohnehin als Zwischenfrucht auf dem Feld steht.',
    bild: '/images/produkte/senf.jpg',
    bildAlt: 'Senfgläser aus der eigenen Manufaktur',
    varianten: [{ id: 'senf-1', gebinde: null, preisCent: null, grundmenge: 'kg' }],
  },
]

/** Steht mindestens ein Preis? Danach richtet sich, ob der Shop rechnet. */
export const PREISE_GEPFLEGT = ARTIKEL.some((a) =>
  a.varianten.some((v) => typeof v.preisCent === 'number'),
)

export function artikelBySlug(slug: string) {
  return ARTIKEL.find((a) => a.slug === slug)
}

export function variante(id: string) {
  for (const a of ARTIKEL) {
    const v = a.varianten.find((x) => x.id === id)
    if (v) return { artikel: a, variante: v }
  }
  return undefined
}

/** Cent als deutscher Preis. Ohne Preis gibt es keinen Ersatzwert. */
export function preisText(cent: number | null | undefined) {
  if (typeof cent !== 'number') return null
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cent / 100)
}

/** Grundpreis nach PAngV, sobald Gebinde und Preis bekannt sind. */
export function grundpreisText(v: Variante) {
  if (typeof v.preisCent !== 'number' || !v.menge || !v.grundmenge) return null
  const proEinheit = v.preisCent / v.menge
  return `${preisText(Math.round(proEinheit))} je ${v.grundmenge === 'kg' ? 'Kilogramm' : 'Liter'}`
}
