export type Member = {
  id: string
  name: string
  role: string
  responsibility: string
  image?: string
  /** true = Name und Rolle sind noch nicht belegt und muessen ersetzt werden */
  platzhalter: boolean
}

/**
 * ACHTUNG · PLATZHALTER
 * Die Namen des Teams liessen sich aus der Bauumgebung nicht belegen
 * (team-kornkammer.de und ruhrtalgold.de sind hier nicht erreichbar).
 * Statt Personen zu erfinden, stehen hier Rollen ohne Namen. Die Seite
 * weist das sichtbar aus. Ersetzen: Name, Rolle, Foto eintragen und
 * `platzhalter` auf false setzen.
 */
export const TEAM: Member[] = [
  {
    id: 'betriebsleitung',
    name: 'Name folgt',
    role: 'Betriebsleitung',
    responsibility: 'Fruchtfolge, Flächen, alle Entscheidungen, die das Feld betreffen.',
    platzhalter: true,
  },
  {
    id: 'verarbeitung',
    name: 'Name folgt',
    role: 'Verarbeitung',
    responsibility: 'Mühle, Ölpressung und Senfmanufaktur.',
    platzhalter: true,
  },
  {
    id: 'hofverkauf',
    name: 'Name folgt',
    role: 'Hofverkauf',
    responsibility: 'Der Freitag am Hof, Sortiment und Kundschaft.',
    platzhalter: true,
  },
  {
    id: 'technik',
    name: 'Name folgt',
    role: 'Technik',
    responsibility: 'Maschinen, Werkstatt und alles, was zur Ernte laufen muss.',
    platzhalter: true,
  },
]

export const TEAM_UNBESTAETIGT = TEAM.some((m) => m.platzhalter)
