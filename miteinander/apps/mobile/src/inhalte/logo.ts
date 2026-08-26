/**
 * Das Logo.
 *
 * Zwei Fassungen: die vollstaendige Wortmarke und die Bildmarke allein fuer
 * enge Stellen. Beide liegen transparent vor und stehen damit auf hellem wie
 * auf dunklem Grund.
 *
 * Das Logo traegt den Namen als Bild. Wo der Name gelesen werden muss, steht
 * er zusaetzlich als Text -- ein Screenreader liest kein Bild, und Schrift in
 * einem Bild waechst nicht mit der eingestellten Schriftgroesse mit.
 */
export const logoWortmarke = {
  source: require('../../assets/logo/helpmate.png') as number,
  seitenverhaeltnis: 900 / 282,
};

export const logoBildmarke = {
  source: require('../../assets/logo/helpmate-marke.png') as number,
  seitenverhaeltnis: 240 / 300,
};
