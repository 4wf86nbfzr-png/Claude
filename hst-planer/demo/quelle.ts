/**
 * Einstiegspunkt fuer die Demo-Datei (demo/index.html).
 *
 * Nicht dabei ist der zweite Faktor: er rechnet mit node:crypto und
 * liesse sich im Browser nur nachbauen – und ein Nachbau waere genau das,
 * was diese Datei nicht sein soll. Er steht unter tests/totp.test.ts,
 * geprueft gegen die Werte aus Anhang B des RFC 6238.
 *
 * Hier wird KEINE Logik nachgebaut: Die Module stammen unveraendert aus
 * src/lib/ und werden nur fuer den Browser gebuendelt. Was in der Demo
 * rechnet, rechnet in der Anwendung genauso.
 */
import {
  formatDiff, formatHours, formatMinutes, isoDate, minutesToHours,
  normalizeTime, parseGermanDate, parseTimeToMinutes, shiftDuration,
  shiftMinutes, timeDiffMinutes, weekdayDE, formatDateDE,
} from '../src/lib/time';
import { matchName, nameSimilarity, nameTokens, normalizeName, editDistance } from '../src/lib/match';
import { parseRequestEmail } from '../src/lib/email/parser';
import { reconcile, ISSUE_LABEL } from '../src/lib/reconcile/engine';
import { parseCsv, splitCsvLine, detectDelimiter } from '../src/lib/import/sheet';
import { suggestMapping, readName, readCell, TIMESHEET_FIELDS } from '../src/lib/import/columns';
import { ROW_STATUS, EVENT_STATUS, ASSIGNMENT_STATUS, besetzung } from '../src/lib/status';
import { pruefe, ueberschneidet, blockiert, ueberschrift } from '../src/lib/dispo/pruefung';
import {
  ALLE_RECHTE, can, navFor, personenfelder, ROLE_LABEL, ROLE_BESCHREIBUNG,
  ROLE_PERMISSIONS, ROLES, scopeOf,
} from '../src/lib/auth/rbac';

declare global {
  interface Window { HST: Record<string, unknown> }
}

window.HST = {
  // Zeitberechnung
  parseTimeToMinutes, formatMinutes, normalizeTime, shiftDuration, shiftMinutes,
  timeDiffMinutes, formatDiff, formatHours, minutesToHours,
  parseGermanDate, formatDateDE, isoDate, weekdayDE,
  // Namensabgleich
  normalizeName, nameTokens, editDistance, nameSimilarity, matchName,
  // E-Mail
  parseRequestEmail,
  // Import und Abgleich
  parseCsv, splitCsvLine, detectDelimiter, suggestMapping, readName, readCell, TIMESHEET_FIELDS,
  reconcile, ISSUE_LABEL,
  // Zuordnungspruefung (SecPlan 4)
  pruefe, ueberschneidet, blockiert, ueberschrift,
  // Rollen und Rechte (SecPlan 7/8)
  ALLE_RECHTE, can, navFor, personenfelder, ROLE_LABEL, ROLE_BESCHREIBUNG,
  ROLE_PERMISSIONS, ROLES, scopeOf,
  // Anzeige
  ROW_STATUS, EVENT_STATUS, ASSIGNMENT_STATUS, besetzung,
};
