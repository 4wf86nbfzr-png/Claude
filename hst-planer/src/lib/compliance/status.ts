import 'server-only';
import { db } from '../db';

/**
 * Stand der Compliance-Zentrale (SecPlan 22, 23 und 30).
 *
 * Diese Datei zählt, was da ist, und sagt, was fehlt. Sie berechnet
 * ausdrücklich KEINE Erfüllungsquote. „98 % DSGVO-konform" wäre eine
 * Zahl ohne Gegenstand: Datenschutz ist nicht teilbar, und eine fehlende
 * Rechtsgrundlage lässt sich nicht gegen zehn vorhandene aufrechnen.
 *
 * Zweitens unterscheidet sie durchgehend zwei Dinge:
 *   TECHNISCH UMGESETZT – im System vorhanden, hier feststellbar.
 *   RECHTLICH GEPRÜFT   – von einem Menschen bewertet, hier nur ablesbar.
 * Das System kann nur das erste feststellen.
 */

export interface Punkt {
  /** Kurzname des Bereichs, z. B. "Verzeichnis der Verarbeitungstätigkeiten". */
  titel: string;
  /** Wohin man geht, um daran zu arbeiten. */
  href: string;
  /** Wie viele Einträge geführt werden. */
  gefuehrt: number;
  /**
   * Eine zweite Zahl neben „geführt". Was sie bedeutet, steht in
   * `geprueftLabel` – bei den meisten Bereichen ist es der Prüfstand,
   * bei den TOM der Umsetzungsstand. Beides in dieselbe Spalte zu
   * schreiben und „rechtlich geprüft" darüberzuschreiben wäre falsch.
   */
  geprueft: number | null;
  geprueftLabel?: string;
  /** Was konkret offen ist; leer heißt: hier ist gerade nichts zu tun. */
  offen: string[];
  /** Dringlichkeit für die Sortierung und Einfärbung. */
  stufe: 'offen' | 'in_arbeit' | 'erledigt';
}

/**
 * Stufe eines Bereichs.
 *
 * Wichtig: Ein Bereich, in dem nichts rechtlich geprüft ist, ist nie
 * „erledigt" – auch wenn keine einzelne Aufgabe offen aussieht. Sonst
 * stünde hier grün, weil die Einträge vollständig sind, obwohl niemand
 * sie je angesehen hat.
 */
function stufeAus(gefuehrt: number, offen: string[], geprueft: number | null = null): Punkt['stufe'] {
  if (gefuehrt === 0) return 'offen';
  if (geprueft !== null && geprueft < gefuehrt) return 'in_arbeit';
  return offen.length > 0 ? 'in_arbeit' : 'erledigt';
}

/** Ergänzt die Liste der offenen Punkte um den Prüfstand. */
function pruefstandHinweis(offen: string[], gefuehrt: number, geprueft: number, was: string): void {
  if (gefuehrt === 0) return;
  if (geprueft === 0) offen.push(`Kein Eintrag ist rechtlich geprüft (${gefuehrt} ${was}).`);
  else if (geprueft < gefuehrt) offen.push(`${gefuehrt - geprueft} von ${gefuehrt} ${was} sind noch nicht rechtlich geprüft.`);
}

export async function complianceStand(): Promise<Punkt[]> {
  const heute = new Date();
  const in30Tagen = new Date(heute.getTime() + 30 * 86400000);

  const [
    vvt, vvtOffeneGrundlage, vvtGeprueft, vvtPruefungFaellig,
    avv, avvOhneVertrag, avvDrittland, avvKi,
    regeln, regelnGeprueft, dokumenteOhneFrist, faelligeLoeschungen,
    anfragen, anfragenOffen, anfragenUeberfaellig,
    vorfaelle, vorfaelleUnbewertet, vorfaelleOffen,
    dsfa, dsfaOffen, dsfaErforderlichOhneDurchfuehrung,
    tom, tomUmgesetzt, tomNichtUmgesetzt, tomPruefungFaellig,
    dokumente, dokumenteFreigegeben, dokumenteFaellig,
  ] = await Promise.all([
    db.processingActivity.count({ where: { deletedAt: null } }),
    db.processingActivity.count({ where: { deletedAt: null, lawfulBasis: 'OFFEN' } }),
    db.processingActivity.count({ where: { deletedAt: null, status: 'RECHTLICH_GEPRUEFT' } }),
    db.processingActivity.count({ where: { deletedAt: null, nextReviewAt: { not: null, lte: in30Tagen } } }),

    db.processor.count({ where: { deletedAt: null } }),
    db.processor.count({ where: { deletedAt: null, avvStatus: { in: ['NICHT_VORHANDEN', 'ENTWURF'] }, personalData: true } }),
    db.processor.count({ where: { deletedAt: null, thirdCountry: true, transferBasis: null } }),
    db.processor.count({ where: { deletedAt: null, aiSystem: true, personalData: true } }),

    db.retentionRule.count({ where: { deletedAt: null } }),
    db.retentionRule.count({ where: { deletedAt: null, status: 'RECHTLICH_GEPRUEFT' } }),
    db.document.count({ where: { deletedAt: null, deleteAt: null, retentionRuleId: null } }),
    db.document.count({ where: { deletedAt: null, deleteAt: { not: null, lte: heute } } }),

    db.dataSubjectRequest.count(),
    db.dataSubjectRequest.count({ where: { status: { notIn: ['BEANTWORTET', 'ABGELEHNT'] } } }),
    db.dataSubjectRequest.count({
      where: { status: { notIn: ['BEANTWORTET', 'ABGELEHNT'] }, dueAt: { lt: heute } },
    }),

    db.dataBreach.count(),
    db.dataBreach.count({ where: { reportable: null, status: { notIn: ['ABGESCHLOSSEN', 'KEINE_MELDUNG'] } } }),
    db.dataBreach.count({ where: { status: { notIn: ['ABGESCHLOSSEN', 'KEINE_MELDUNG'] } } }),

    db.dpia.count(),
    db.dpia.count({ where: { necessity: 'OFFEN' } }),
    db.dpia.count({ where: { necessity: 'ERFORDERLICH', status: { not: 'RECHTLICH_GEPRUEFT' } } }),

    db.tomMeasure.count(),
    db.tomMeasure.count({ where: { status: { in: ['TECHNISCH_UMGESETZT', 'ORGANISATORISCH_GEREGELT'] } } }),
    db.tomMeasure.count({ where: { status: 'NICHT_UMGESETZT' } }),
    db.tomMeasure.count({ where: { nextCheckAt: { not: null, lte: in30Tagen } } }),

    db.complianceDocument.count({ where: { deletedAt: null } }),
    db.complianceDocument.count({ where: { deletedAt: null, status: 'RECHTLICH_GEPRUEFT' } }),
    db.complianceDocument.count({ where: { deletedAt: null, nextReviewAt: { not: null, lte: in30Tagen } } }),
  ]);

  const punkte: Punkt[] = [];

  {
    const offen: string[] = [];
    if (vvt === 0) offen.push('Es ist keine Verarbeitungstätigkeit erfasst.');
    if (vvtOffeneGrundlage > 0) offen.push(`${vvtOffeneGrundlage} Tätigkeiten ohne geprüfte Rechtsgrundlage.`);
    if (vvtPruefungFaellig > 0) offen.push(`${vvtPruefungFaellig} Tätigkeiten stehen zur Wiedervorlage an.`);
    pruefstandHinweis(offen, vvt, vvtGeprueft, 'Tätigkeiten');
    punkte.push({
      titel: 'Verzeichnis von Verarbeitungstätigkeiten (Art. 30)',
      href: '/compliance/datenschutz', gefuehrt: vvt, geprueft: vvtGeprueft,
      geprueftLabel: 'rechtlich geprüft', offen,
      stufe: stufeAus(vvt, offen, vvtGeprueft),
    });
  }

  {
    const offen: string[] = [];
    if (avv === 0) offen.push('Es ist kein Auftragsverarbeiter erfasst.');
    if (avvOhneVertrag > 0) offen.push(`${avvOhneVertrag} Verarbeiter mit Personenbezug ohne unterzeichneten AVV.`);
    if (avvDrittland > 0) offen.push(`${avvDrittland} Drittlandtransfers ohne eingetragene Grundlage.`);
    if (avvKi > 0) offen.push(`${avvKi} KI-Systeme, an die personenbezogene Daten gehen könnten – gesondert zu prüfen.`);
    punkte.push({
      titel: 'Auftragsverarbeiter (Art. 28)',
      href: '/compliance/avv', gefuehrt: avv, geprueft: null, offen,
      stufe: stufeAus(avv, offen),
    });
  }

  {
    const offen: string[] = [];
    if (regeln === 0) offen.push('Es ist keine Löschregel erfasst.');
    if (dokumenteOhneFrist > 0) offen.push(`${dokumenteOhneFrist} Dokumente ohne Frist – ohne Frist wird nichts gelöscht.`);
    if (faelligeLoeschungen > 0) offen.push(`${faelligeLoeschungen} Dokumente haben ihr Löschdatum erreicht.`);
    pruefstandHinweis(offen, regeln, regelnGeprueft, 'Regeln');
    punkte.push({
      titel: 'Löschkonzept',
      href: '/compliance/loeschfristen', gefuehrt: regeln, geprueft: regelnGeprueft,
      geprueftLabel: 'rechtlich geprüft', offen,
      stufe: stufeAus(regeln, offen, regelnGeprueft),
    });
  }

  {
    const offen: string[] = [];
    if (anfragenUeberfaellig > 0) offen.push(`${anfragenUeberfaellig} Anfragen über der Frist nach Art. 12 Abs. 3.`);
    else if (anfragenOffen > 0) offen.push(`${anfragenOffen} Anfragen in Bearbeitung.`);
    // Null Anfragen ist hier kein Mangel, sondern der Regelfall.
    punkte.push({
      titel: 'Betroffenenrechte (Art. 12–22)',
      href: '/compliance/datenschutz', gefuehrt: anfragen, geprueft: null, offen,
      stufe: anfragenUeberfaellig > 0 ? 'offen' : anfragenOffen > 0 ? 'in_arbeit' : 'erledigt',
    });
  }

  {
    const offen: string[] = [];
    if (vorfaelleUnbewertet > 0) offen.push(`${vorfaelleUnbewertet} Vorfälle ohne Bewertung der Meldepflicht.`);
    if (vorfaelleOffen > 0) offen.push(`${vorfaelleOffen} Vorfälle nicht abgeschlossen.`);
    punkte.push({
      titel: 'Datenschutzvorfälle (Art. 33/34)',
      href: '/compliance/vorfaelle', gefuehrt: vorfaelle, geprueft: null, offen,
      stufe: vorfaelleOffen > 0 ? 'offen' : 'erledigt',
    });
  }

  {
    const offen: string[] = [];
    if (dsfaOffen > 0) offen.push(`${dsfaOffen} Vorgänge ohne Entscheidung, ob eine DSFA nötig ist.`);
    if (dsfaErforderlichOhneDurchfuehrung > 0) offen.push(`${dsfaErforderlichOhneDurchfuehrung} als erforderlich bewertete DSFA noch nicht abgeschlossen.`);
    punkte.push({
      titel: 'Datenschutz-Folgenabschätzung (Art. 35)',
      href: '/compliance/dsfa', gefuehrt: dsfa, geprueft: null, offen,
      stufe: stufeAus(dsfa, offen),
    });
  }

  {
    const offen: string[] = [];
    if (tom === 0) offen.push('Es ist keine Maßnahme erfasst.');
    if (tomNichtUmgesetzt > 0) offen.push(`${tomNichtUmgesetzt} Maßnahmen ausdrücklich nicht umgesetzt.`);
    if (tomPruefungFaellig > 0) offen.push(`${tomPruefungFaellig} Maßnahmen stehen zur Überprüfung an.`);
    punkte.push({
      titel: 'Technische und organisatorische Maßnahmen (Art. 32)',
      href: '/compliance/tom', gefuehrt: tom, geprueft: tomUmgesetzt,
      // Ausdrücklich NICHT „rechtlich geprüft": dass eine Maßnahme im
      // System vorhanden ist, sagt nichts darüber, ob sie im Sinne des
      // Art. 32 Abs. 1 angemessen ist.
      geprueftLabel: 'umgesetzt oder geregelt',
      offen,
      stufe: stufeAus(tom, offen),
    });
  }

  {
    const offen: string[] = [];
    if (dokumente === 0) offen.push('Es ist keine Unterlage hinterlegt.');
    if (dokumenteFaellig > 0) offen.push(`${dokumenteFaellig} Unterlagen stehen zur Wiedervorlage an.`);
    pruefstandHinweis(offen, dokumente, dokumenteFreigegeben, 'Unterlagen');
    punkte.push({
      titel: 'Dokumentation und Nachweise',
      href: '/compliance/dokumentation', gefuehrt: dokumente, geprueft: dokumenteFreigegeben,
      geprueftLabel: 'rechtlich geprüft', offen,
      stufe: stufeAus(dokumente, offen, dokumenteFreigegeben),
    });
  }

  return punkte;
}

/**
 * Ein Satz über den Gesamtstand – ohne Prozentzahl und ohne die
 * Behauptung, irgendetwas sei „konform".
 */
export function gesamtsatz(punkte: readonly Punkt[]): string {
  const offen = punkte.filter((p) => p.stufe === 'offen').length;
  const arbeit = punkte.filter((p) => p.stufe === 'in_arbeit').length;
  if (offen === 0 && arbeit === 0) {
    return 'In allen geführten Bereichen ist derzeit nichts offen. Das ist eine Aussage über den Stand der Einträge, nicht über die Rechtslage.';
  }
  const teile: string[] = [];
  if (offen > 0) teile.push(`${offen} ${offen === 1 ? 'Bereich ist' : 'Bereiche sind'} offen`);
  if (arbeit > 0) teile.push(`${arbeit} in Arbeit`);
  return `${teile.join(', ')}. Was hier steht, ist der Stand der Einträge – keine rechtliche Bewertung.`;
}
