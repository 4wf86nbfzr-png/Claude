/**
 * Einstiegspunkt fuer die Demo-Datei (demo/index.html).
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
  // Anzeige
  ROW_STATUS, EVENT_STATUS, ASSIGNMENT_STATUS, besetzung,
};
