/**
 * Stammdaten.
 *
 * QUELLENLAGE: team-kornkammer.de und ruhrtalgold.de waren aus der Bauumgebung
 * nicht erreichbar (Egress gesperrt). Die hier gesetzten Werte stammen aus
 * oeffentlich indexierten Angaben. Alles, was sich nicht eindeutig belegen
 * liess, traegt `unbestaetigt: true` und wird im Layout sichtbar als
 * „bitte bestaetigen" ausgewiesen, statt es zu erfinden.
 */

export const FARM = {
  name: 'Team Kornkammer',
  legalName: 'Kornkammer Haus Holte GbR',
  claim: 'Ein Stück Natur aus dem Revier',
  since: 1987,

  address: {
    street: 'Gederfeldweg 37',
    zip: '58453',
    city: 'Witten',
    region: 'Nordrhein-Westfalen',
    country: 'DE',
  },

  phone: { display: '+49 2302 2827475', href: 'tel:+4923022827475' },
  email: { display: 'Team-Kornkammer@gmx.de', href: 'mailto:Team-Kornkammer@gmx.de' },

  instagram: 'https://www.instagram.com/teamkornkammer/',
  shop: 'https://shopteamkornkammer.company.site/',

  /** Hofverkauf. Die Zeitangabe war in den Quellen uneinheitlich. */
  hofladen: {
    day: 'Freitag',
    from: '8',
    to: '17',
    holidayRule: 'Fällt der Freitag auf einen Feiertag, findet der Verkauf am Donnerstag statt.',
    unbestaetigt: true,
  },

  certifications: ['Bioland', 'EU Bio', 'GlobalGAP'],
} as const

/** Koordinaten fuer die Route sind nicht belegt — der Link geht ueber die Adresse. */
export const ROUTE_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  `${FARM.address.street}, ${FARM.address.zip} ${FARM.address.city}`,
)}`

export const SITE = {
  url: 'https://www.team-kornkammer.de',
  locale: 'de_DE',
  titleDefault: 'Team Kornkammer — Ein Stück Natur aus dem Revier',
  titleTemplate: '%s — Team Kornkammer',
  description:
    'Kornkammer Haus Holte bewirtschaftet Felder mitten im Ruhrgebiet nach Bioland Richtlinien. Getreide, Kartoffeln, Speiseöle, Nudeln und Senf aus eigener Erzeugung.',
} as const
