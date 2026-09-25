/**
 * Einheitliche Übersetzung und Einfaerbung aller Status (Spec 5).
 * Gruen = erledigt/besetzt, Gelb = Aufmerksamkeit, Rot = Problem, Blau = Information.
 */
export type Farbe = 'gruen' | 'gelb' | 'rot' | 'blau' | 'grau' | 'beige';

export const EVENT_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  ANFRAGE:       { label: 'Anfrage',       farbe: 'blau' },
  PLANUNG:       { label: 'Planung',       farbe: 'blau' },
  TEILBESETZT:   { label: 'Teilbesetzt',   farbe: 'gelb' },
  BESETZT:       { label: 'Besetzt',       farbe: 'gruen' },
  BESTAETIGT:    { label: 'Bestätigt',    farbe: 'gruen' },
  LAUFEND:       { label: 'Laufend',       farbe: 'blau' },
  ABGESCHLOSSEN: { label: 'Abgeschlossen', farbe: 'grau' },
  ABGERECHNET:   { label: 'Abgerechnet',   farbe: 'grau' },
  STORNIERT:     { label: 'Storniert',     farbe: 'rot' },
};

export const ASSIGNMENT_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  VORGESCHLAGEN:   { label: 'Vorgeschlagen',   farbe: 'grau' },
  ANGEFRAGT:       { label: 'Angefragt',       farbe: 'gelb' },
  ZUGESAGT:        { label: 'Zugesagt',        farbe: 'gruen' },
  ABGESAGT:        { label: 'Abgesagt',        farbe: 'rot' },
  EINGETEILT:      { label: 'Eingeteilt',      farbe: 'blau' },
  ERSCHIENEN:      { label: 'Erschienen',      farbe: 'gruen' },
  NICHT_ERSCHIENEN:{ label: 'Nicht erschienen',farbe: 'rot' },
  STORNIERT:       { label: 'Storniert',       farbe: 'grau' },
};

export const REQUEST_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  NEU:          { label: 'Neu – Prüfung erforderlich', farbe: 'gelb' },
  IN_PRUEFUNG:  { label: 'In Prüfung',   farbe: 'blau' },
  ANGEBOT:      { label: 'Angebot raus',  farbe: 'blau' },
  UEBERNOMMEN:  { label: 'Übernommen',   farbe: 'gruen' },
  ABGELEHNT:    { label: 'Abgelehnt',     farbe: 'rot' },
  ARCHIVIERT:   { label: 'Archiviert',    farbe: 'grau' },
};

export const ROW_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  OK:          { label: 'Identisch',    farbe: 'gruen' },
  ABWEICHUNG:  { label: 'Abweichung',   farbe: 'gelb' },
  FEHLEND:     { label: 'Keine Ist-Zeit', farbe: 'rot' },
  UNBEKANNT:   { label: 'Unbekannt',    farbe: 'rot' },
  ZUSAETZLICH: { label: 'Nicht geplant',farbe: 'rot' },
  DUPLIKAT:    { label: 'Doppelt',      farbe: 'rot' },
  MEHRDEUTIG:  { label: 'Mehrdeutig',   farbe: 'rot' },
  GEPRUEFT:    { label: 'Geprüft',     farbe: 'blau' },
  IGNORIERT:   { label: 'Ignoriert',    farbe: 'grau' },
};

export const RECONCILIATION_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  ENTWURF:     { label: 'Entwurf',      farbe: 'grau' },
  VERARBEITET: { label: 'Verarbeitet',  farbe: 'gelb' },
  ABGESCHLOSSEN: { label: 'Abgeschlossen', farbe: 'gruen' },
};

export const TIME_ENTRY_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  OFFEN:       { label: 'Offen',       farbe: 'gelb' },
  GEPRUEFT:    { label: 'Geprüft',    farbe: 'blau' },
  FREIGEGEBEN: { label: 'Freigegeben', farbe: 'gruen' },
  ABGERECHNET: { label: 'Abgerechnet', farbe: 'grau' },
};

export const INCIDENT_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  OFFEN:          { label: 'Offen',          farbe: 'rot' },
  IN_BEARBEITUNG: { label: 'In Bearbeitung', farbe: 'gelb' },
  GELOEST:        { label: 'Gelöst',        farbe: 'gruen' },
  VERWORFEN:      { label: 'Verworfen',      farbe: 'grau' },
};

export const INCIDENT_KIND: Record<string, string> = {
  NICHT_ERSCHIENEN: 'Nicht erschienen',
  VERSPAETET: 'Verspätet',
  FALSCHE_KLEIDUNG: 'Falsche Kleidung',
  ERSATZ_ERFORDERLICH: 'Ersatz erforderlich',
  KUNDENBESCHWERDE: 'Kundenbeschwerde',
  TECHNISCHES_PROBLEM: 'Technisches Problem',
  SONSTIGES: 'Sonstiges',
};

export const PRIORITY: Record<string, { label: string; farbe: Farbe }> = {
  NIEDRIG:  { label: 'Niedrig',  farbe: 'grau' },
  NORMAL:   { label: 'Normal',   farbe: 'grau' },
  HOCH:     { label: 'Hoch',     farbe: 'gelb' },
  KRITISCH: { label: 'Kritisch', farbe: 'rot' },
};

export const EMPLOYMENT_TYPE: Record<string, string> = {
  FESTANSTELLUNG: 'Festanstellung',
  TEILZEIT: 'Teilzeit',
  MINIJOB: 'Minijob',
  AUSHILFE: 'Aushilfe',
  WERKSTUDENT: 'Werkstudent',
  SUBUNTERNEHMER: 'Subunternehmer',
};

export const AVAILABILITY_KIND: Record<string, { label: string; farbe: Farbe }> = {
  VERFUEGBAR:      { label: 'Verfügbar',      farbe: 'gruen' },
  NICHT_VERFUEGBAR:{ label: 'Nicht verfügbar',farbe: 'rot' },
  BEVORZUGT:       { label: 'Bevorzugt',       farbe: 'blau' },
  URLAUB:          { label: 'Urlaub',          farbe: 'gelb' },
  KRANK:           { label: 'Krank',           farbe: 'rot' },
};

export const DOCUMENT_TYPE: Record<string, string> = {
  FUEHRUNGSZEUGNIS: 'Führungszeugnis',
  AUSWEIS: 'Ausweis',
  SCHULUNGSNACHWEIS: 'Schulungsnachweis',
  VERTRAG: 'Vertrag',
  ANGEBOT: 'Angebot',
  EINSATZPLAN: 'Einsatzplan',
  STUNDENZETTEL: 'Stundenzettel',
  ARBEITSVERTRAG: 'Arbeitsvertrag',
  BEWERBUNG: 'Bewerbung',
  COMPLIANCE: 'Compliance-Unterlage',
  SONSTIGES: 'Sonstiges',
};

// ---------------------------------------------------------------- SecPlan

export const DOCUMENT_ACCESS: Record<string, string> = {
  PERSONAL_INTERN: 'Personal (intern)',
  DISPOSITION: 'Disposition',
  EINSATZBEZOGEN: 'Einsatzbezogen',
  MITARBEITER: 'Betroffene Person',
  KUNDE: 'Kunde',
  PARTNER: 'Partnerunternehmen',
};

export const APPLICANT_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  EINGEGANGEN: { label: 'Eingegangen', farbe: 'blau' },
  IN_PRUEFUNG: { label: 'In Prüfung', farbe: 'gelb' },
  GESPRAECH: { label: 'Gespräch', farbe: 'beige' },
  ZUSAGE: { label: 'Zusage', farbe: 'gruen' },
  ABSAGE: { label: 'Absage', farbe: 'grau' },
  UEBERNOMMEN: { label: 'Übernommen', farbe: 'gruen' },
};

export const TRAINING_RESULT: Record<string, { label: string; farbe: Farbe }> = {
  ANGEMELDET: { label: 'Angemeldet', farbe: 'blau' },
  TEILGENOMMEN: { label: 'Teilgenommen', farbe: 'gruen' },
  BESTANDEN: { label: 'Bestanden', farbe: 'gruen' },
  NICHT_BESTANDEN: { label: 'Nicht bestanden', farbe: 'rot' },
  ABGEMELDET: { label: 'Abgemeldet', farbe: 'grau' },
};

/**
 * Prüfstand einer Compliance-Unterlage.
 *
 * Wichtig: TECHNISCH_UMGESETZT und RECHTLICH_GEPRUEFT sind zwei Dinge.
 * Das System kann das erste feststellen, das zweite nie (SecPlan 30).
 */
export const PRUEF_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  ENTWURF: { label: 'Entwurf', farbe: 'grau' },
  IN_PRUEFUNG: { label: 'In Prüfung', farbe: 'gelb' },
  TECHNISCH_UMGESETZT: { label: 'Technisch umgesetzt', farbe: 'blau' },
  RECHTLICH_GEPRUEFT: { label: 'Rechtlich geprüft', farbe: 'gruen' },
  UEBERHOLT: { label: 'Überholt', farbe: 'rot' },
};

export const RECHTSGRUNDLAGE: Record<string, string> = {
  ART6_1A_EINWILLIGUNG: 'Art. 6 Abs. 1 lit. a – Einwilligung',
  ART6_1B_VERTRAG: 'Art. 6 Abs. 1 lit. b – Vertrag',
  ART6_1C_RECHTLICHE_PFLICHT: 'Art. 6 Abs. 1 lit. c – rechtliche Pflicht',
  ART6_1D_LEBENSWICHTIG: 'Art. 6 Abs. 1 lit. d – lebenswichtige Interessen',
  ART6_1E_OEFFENTLICHES_INTERESSE: 'Art. 6 Abs. 1 lit. e – öffentliches Interesse',
  ART6_1F_BERECHTIGTES_INTERESSE: 'Art. 6 Abs. 1 lit. f – berechtigtes Interesse',
  PARA26_BDSG_BESCHAEFTIGUNG: '§ 26 BDSG – Beschäftigungsverhältnis',
  OFFEN: 'noch nicht geprüft',
};

export const AVV_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  NICHT_VORHANDEN: { label: 'Nicht vorhanden', farbe: 'rot' },
  ENTWURF: { label: 'Entwurf', farbe: 'gelb' },
  UNTERZEICHNET: { label: 'Unterzeichnet', farbe: 'gruen' },
  GEKUENDIGT: { label: 'Gekündigt', farbe: 'grau' },
};

export const BETROFFENEN_RECHT: Record<string, string> = {
  AUSKUNFT: 'Auskunft (Art. 15)',
  BERICHTIGUNG: 'Berichtigung (Art. 16)',
  LOESCHUNG: 'Löschung (Art. 17)',
  EINSCHRAENKUNG: 'Einschränkung (Art. 18)',
  DATENUEBERTRAGBARKEIT: 'Datenübertragbarkeit (Art. 20)',
  WIDERSPRUCH: 'Widerspruch (Art. 21)',
  WIDERRUF_EINWILLIGUNG: 'Widerruf der Einwilligung (Art. 7 Abs. 3)',
};

export const ANFRAGE_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  EINGEGANGEN: { label: 'Eingegangen', farbe: 'blau' },
  IDENTITAET_PRUEFEN: { label: 'Identität prüfen', farbe: 'gelb' },
  IN_BEARBEITUNG: { label: 'In Bearbeitung', farbe: 'gelb' },
  BEANTWORTET: { label: 'Beantwortet', farbe: 'gruen' },
  ABGELEHNT: { label: 'Abgelehnt', farbe: 'grau' },
  FRIST_UEBERSCHRITTEN: { label: 'Frist überschritten', farbe: 'rot' },
};

export const VORFALL_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  ENTDECKT: { label: 'Entdeckt', farbe: 'rot' },
  IN_BEWERTUNG: { label: 'In Bewertung', farbe: 'gelb' },
  GEMELDET: { label: 'Gemeldet', farbe: 'blau' },
  ABGESCHLOSSEN: { label: 'Abgeschlossen', farbe: 'gruen' },
  KEINE_MELDUNG: { label: 'Ohne Meldung abgeschlossen', farbe: 'grau' },
};

export const TOM_BEREICH: Record<string, string> = {
  ZUTRITT: 'Zutrittskontrolle',
  ZUGANG: 'Zugangskontrolle',
  ZUGRIFF: 'Zugriffskontrolle',
  WEITERGABE: 'Weitergabekontrolle',
  EINGABE: 'Eingabekontrolle',
  AUFTRAG: 'Auftragskontrolle',
  VERFUEGBARKEIT: 'Verfügbarkeitskontrolle',
  TRENNUNG: 'Trennungsgebot',
  VERSCHLUESSELUNG: 'Verschlüsselung',
  BELASTBARKEIT: 'Belastbarkeit',
  WIEDERHERSTELLUNG: 'Wiederherstellbarkeit',
  UEBERPRUEFUNG: 'Regelmäßige Überprüfung',
};

export const TOM_STATUS: Record<string, { label: string; farbe: Farbe }> = {
  GEPLANT: { label: 'Geplant', farbe: 'gelb' },
  TECHNISCH_UMGESETZT: { label: 'Technisch umgesetzt', farbe: 'gruen' },
  ORGANISATORISCH_GEREGELT: { label: 'Organisatorisch geregelt', farbe: 'blau' },
  NICHT_UMGESETZT: { label: 'Nicht umgesetzt', farbe: 'rot' },
};

export const DSFA_ERGEBNIS: Record<string, { label: string; farbe: Farbe }> = {
  NICHT_ERFORDERLICH: { label: 'Nicht erforderlich', farbe: 'grau' },
  ERFORDERLICH: { label: 'Erforderlich', farbe: 'rot' },
  DURCHGEFUEHRT: { label: 'Durchgeführt', farbe: 'gruen' },
  OFFEN: { label: 'Noch nicht bewertet', farbe: 'gelb' },
};

export const COMPLIANCE_DOC_KIND: Record<string, string> = {
  RICHTLINIE: 'Richtlinie',
  VERFAHRENSANWEISUNG: 'Verfahrensanweisung',
  EINWILLIGUNG: 'Einwilligung',
  INFORMATIONSPFLICHT: 'Informationspflicht',
  VERPFLICHTUNG: 'Verpflichtungserklärung',
  SCHULUNGSUNTERLAGE: 'Schulungsunterlage',
  NACHWEIS: 'Nachweis',
  SONSTIGES: 'Sonstiges',
};

/** Besetzungsgrad in Prozent und passende Farbe. */
export function besetzung(ist: number, soll: number): { prozent: number; farbe: Farbe; text: string } {
  if (soll <= 0) return { prozent: 0, farbe: 'grau', text: '–' };
  const prozent = Math.round((ist / soll) * 100);
  const farbe: Farbe = ist >= soll ? 'gruen' : ist === 0 ? 'rot' : 'gelb';
  return { prozent, farbe, text: `${ist}/${soll}` };
}

export function label(map: Record<string, { label: string; farbe: Farbe }>, key: string | null | undefined): { label: string; farbe: Farbe } {
  if (!key) return { label: '–', farbe: 'grau' };
  return map[key] ?? { label: key, farbe: 'grau' };
}
