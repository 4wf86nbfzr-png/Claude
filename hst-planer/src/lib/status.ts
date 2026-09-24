/**
 * Einheitliche Übersetzung und Einfaerbung aller Status (Spec 5).
 * Gruen = erledigt/besetzt, Gelb = Aufmerksamkeit, Rot = Problem, Blau = Information.
 */
export type Farbe = 'gruen' | 'gelb' | 'rot' | 'blau' | 'grau';

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
