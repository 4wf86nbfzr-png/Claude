/**
 * Spaltenerkennung für Excel-/CSV-Importe (Spec 24).
 *
 * Der Benutzer bekommt immer einen Vorschlag, kann ihn aber vor dem Import
 * überschreiben. Erkannte Zuordnungen lassen sich als Vorlage speichern
 * (Spec 51), damit derselbe Partner-Stundenzettel beim nächsten Mal
 * ohne Nacharbeit durchlaeuft.
 */

export type TimesheetField =
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'personnelNo'
  | 'date'
  | 'start'
  | 'end'
  | 'break'
  | 'event'
  | 'position'
  | 'note';

export interface FieldDefinition {
  field: TimesheetField;
  label: string;
  /** Schluesselwoerter in normalisierter Form (klein, ohne Umlaute/Sonderzeichen). */
  aliases: string[];
  required?: boolean;
}

export const TIMESHEET_FIELDS: FieldDefinition[] = [
  { field: 'name', label: 'Mitarbeiter (kompletter Name)', aliases: ['mitarbeiter', 'name', 'personal', 'mitarbeitername', 'beschäftigter', 'kraft', 'person', 'employee'], required: true },
  { field: 'lastName', label: 'Nachname', aliases: ['nachname', 'familienname', 'lastname', 'surname', 'zuname'] },
  { field: 'firstName', label: 'Vorname', aliases: ['vorname', 'firstname', 'rufname'] },
  { field: 'personnelNo', label: 'Personalnummer', aliases: ['personalnummer', 'persnr', 'persno', 'pnr', 'mitarbeiternummer', 'personalnr', 'ausweisnummer'] },
  { field: 'date', label: 'Datum', aliases: ['datum', 'einsatztag', 'tag', 'date', 'einsatzdatum', 'arbeitstag'], required: true },
  { field: 'start', label: 'Startzeit', aliases: ['start', 'beginn', 'von', 'anfang', 'startzeit', 'dienstbeginn', 'kommt', 'checkin', 'arbeitsbeginn'], required: true },
  { field: 'end', label: 'Endzeit', aliases: ['ende', 'bis', 'endzeit', 'schluss', 'dienstende', 'geht', 'checkout', 'arbeitsende'], required: true },
  { field: 'break', label: 'Pause (Minuten)', aliases: ['pause', 'pausen', 'pausenzeit', 'break', 'unterbrechung'] },
  { field: 'event', label: 'Event / Einsatz', aliases: ['event', 'veranstaltung', 'einsatz', 'objekt', 'auftrag', 'projekt', 'eventid', 'einsatzort', 'baustelle'] },
  { field: 'position', label: 'Position / Funktion', aliases: ['position', 'funktion', 'tätigkeit', 'bereich', 'aufgabe', 'posten'] },
  { field: 'note', label: 'Bemerkung', aliases: ['bemerkung', 'notiz', 'hinweis', 'kommentar', 'anmerkung', 'info'] },
];

export function normalizeHeader(header: string): string {
  return (header ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

export type ColumnMapping = Partial<Record<TimesheetField, string>>;

export interface MappingSuggestion {
  mapping: ColumnMapping;
  /** Spalten, die keinem Feld zugeordnet werden konnten. */
  unmapped: string[];
  /** Pflichtfelder, die noch fehlen. */
  missingRequired: TimesheetField[];
}

/**
 * Schlaegt eine Spaltenzuordnung vor. Exakte Treffer gewinnen vor
 * Teiltreffern; jede Spalte wird höchstens einmal vergeben.
 */
export function suggestMapping(
  headers: readonly string[],
  fields: FieldDefinition[] = TIMESHEET_FIELDS,
): MappingSuggestion {
  const normalized = headers.map((h) => ({ raw: h, key: normalizeHeader(h) }));
  const mapping: ColumnMapping = {};
  const usedColumns = new Set<string>();

  const claim = (field: TimesheetField, raw: string) => {
    mapping[field] = raw;
    usedColumns.add(raw);
  };

  // 1. Durchgang: exakte Alias-Treffer
  for (const def of fields) {
    if (mapping[def.field]) continue;
    const hit = normalized.find((h) => !usedColumns.has(h.raw) && h.key.length > 0 && def.aliases.includes(h.key));
    if (hit) claim(def.field, hit.raw);
  }

  // 2. Durchgang: Teiltreffer ("Beginn (Ist)", "Datum Einsatz")
  for (const def of fields) {
    if (mapping[def.field]) continue;
    const hit = normalized.find(
      (h) => !usedColumns.has(h.raw) && h.key.length >= 3 && def.aliases.some((a) => a.length >= 3 && (h.key.includes(a) || a.includes(h.key))),
    );
    if (hit) claim(def.field, hit.raw);
  }

  // Getrennte Vor-/Nachname-Spalten ersetzen die Sammelspalte.
  if (!mapping.name && mapping.lastName) {
    // kein kombiniertes Feld nötig – der Leser setzt den Namen zusammen
  }

  const unmapped = headers.filter((h) => !usedColumns.has(h));
  const missingRequired = fields
    .filter((d) => d.required)
    .map((d) => d.field)
    .filter((field) => {
      if (mapping[field]) return false;
      // Name gilt als vorhanden, wenn Vor- UND Nachname zugeordnet sind.
      if (field === 'name') return !(mapping.firstName && mapping.lastName);
      return true;
    });

  return { mapping, unmapped, missingRequired };
}

/** Liest den Anzeigenamen einer Zeile aus der Zuordnung zusammen. */
export function readName(row: Record<string, unknown>, mapping: ColumnMapping): string {
  const direct = mapping.name ? String(row[mapping.name] ?? '').trim() : '';
  if (direct) return direct;
  const first = mapping.firstName ? String(row[mapping.firstName] ?? '').trim() : '';
  const last = mapping.lastName ? String(row[mapping.lastName] ?? '').trim() : '';
  return [first, last].filter(Boolean).join(' ').trim();
}

export function readCell(row: Record<string, unknown>, mapping: ColumnMapping, field: TimesheetField): unknown {
  const column = mapping[field];
  if (!column) return null;
  const value = row[column];
  return value === '' ? null : value;
}
