export type Certification = {
  name: string
  kind: string
  claim: string
  body: string
  /** Nur belegbare Aussagen. Keine Werbeversprechen. */
  points: string[]
}

export const CERTIFICATIONS: Certification[] = [
  {
    name: 'Bioland',
    kind: 'Anbauverband',
    claim: 'Geht über die gesetzlichen Mindeststandards hinaus.',
    body: 'Bioland ist ein privatrechtlicher Verband. Wer sich ihm anschließt, verpflichtet sich auf Richtlinien, die enger gefasst sind als die EU Rechtsvorschriften für den ökologischen Landbau. Der Betrieb wird als Ganzes umgestellt, nicht nur einzelne Flächen.',
    points: [
      'Verbandsrichtlinien statt gesetzlicher Mindestanforderung',
      'Der gesamte Betrieb wirtschaftet ökologisch, nicht nur ein Teil',
      'Jährliche Kontrolle',
    ],
  },
  {
    name: 'EU Bio',
    kind: 'Gesetzlicher Rahmen',
    claim: 'Die Grundlage, auf der alles Weitere aufsetzt.',
    body: 'Die EU Rechtsvorschriften für den ökologischen Landbau legen fest, was „Bio" mindestens bedeutet: kein chemisch synthetischer Pflanzenschutz, kein Mineraldünger, keine Gentechnik, dazu eine jährliche Kontrolle durch eine zugelassene Öko Kontrollstelle.',
    points: [
      'Kein chemisch synthetischer Pflanzenschutz',
      'Kein leicht löslicher Mineraldünger',
      'Keine Gentechnik',
      'Jährliche Kontrolle durch eine zugelassene Kontrollstelle',
    ],
  },
  {
    name: 'GlobalGAP',
    kind: 'Qualitätssicherung',
    claim: 'Nachvollziehbarkeit bis zurück auf den Schlag.',
    body: 'GlobalGAP ist ein Standard für gute landwirtschaftliche Praxis. Er regelt vor allem die Dokumentation: Wer wann was auf welcher Fläche gemacht hat, muss belegbar sein.',
    points: [
      'Dokumentierte Rückverfolgbarkeit der Partien',
      'Festgelegte Abläufe für Ernte und Lagerung',
      'Externe Auditierung',
    ],
  },
]
