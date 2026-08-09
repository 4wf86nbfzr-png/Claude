export type Referenz = {
  name: string
  art: string
  ort: string
  /** Was dorthin geliefert wird */
  was: string
}

/**
 * ACHTUNG · LEER
 *
 * Zu den Abnehmern liegen keine belastbaren Angaben vor. Bekannt ist nur
 * die allgemeine Aussage, dass Baeckereien in der Region mit Biomehl
 * beliefert werden — welche, steht nirgends oeffentlich.
 *
 * Namen von Betrieben zu erfinden waere hier besonders heikel: es sind
 * fremde Firmen, und eine falsche Nennung ist schnell ein rechtliches
 * Problem. Deshalb bleibt die Liste leer, und die Seite sagt das offen.
 *
 * Ersetzen: Eintraege hier einfuegen, mehr ist nicht noetig — die Seite
 * schaltet dann von selbst vom Hinweis auf die Liste um.
 */
export const REFERENZEN: Referenz[] = []

/** Belegbar und deshalb schon jetzt auf der Seite. */
export const ABSATZWEGE = [
  {
    titel: 'Bäckereien in der Region',
    text: 'Ein wachsender Teil unseres Getreides wird selbst vermahlen und als Biomehl an Bäckereien geliefert.',
  },
  {
    titel: 'Verkauf ab Hof',
    text: 'Der kürzeste Weg: einmal die Woche direkt an der Hofzufahrt.',
  },
  {
    titel: 'Onlineshop',
    text: 'Ein Teil des Sortiments ist über unseren Shop erhältlich. Er liegt auf einer eigenen Plattform.',
  },
]
