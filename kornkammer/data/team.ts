export type Member = {
  id: string
  name: string
  /** Funktion im Betrieb. Leer, solange sie nicht belegt ist. */
  role: string
  /** Verantwortung, ebenfalls nur wenn belegt. */
  responsibility: string
  image?: string
  imageAlt?: string
}

/**
 * Namen und Fotos stammen von team-kornkammer.de.
 *
 * Die Bilder sind aus Bildschirmfotos der Bestandsseite freigestellt, mehr
 * lag nicht vor. Fuer Karten in dieser Groesse reicht das, gross gezogen
 * sieht man die Herkunft. Wer die Originale hat, tauscht die Dateien unter
 * `public/images/team/` einfach aus.
 *
 * OFFEN: Zu keiner der Personen ist die Funktion im Betrieb belegt. Sie
 * bleibt deshalb leer, und die Seite weist das aus, statt eine Rolle zu
 * erfinden. Ebenso fehlen die uebrigen Mitglieder des Teams.
 */
export const TEAM: Member[] = [
  {
    id: 'stefan-pawliczek',
    name: 'Stefan Pawliczek',
    role: '',
    responsibility: '',
    image: '/images/team/stefan-pawliczek.webp',
    imageAlt: 'Stefan Pawliczek im blühenden Rapsfeld',
  },
  {
    id: 'dirk-liedmann',
    name: 'Dirk Liedmann',
    role: '',
    responsibility: '',
    image: '/images/team/dirk-liedmann.webp',
    imageAlt: 'Dirk Liedmann im blühenden Rapsfeld',
  },
]

/** Solange Funktionen fehlen, sagt die Seite das offen. */
export const TEAM_UNVOLLSTAENDIG = TEAM.some((m) => !m.role)
