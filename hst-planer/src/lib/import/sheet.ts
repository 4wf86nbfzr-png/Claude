/**
 * Einlesen von XLSX- und CSV-Dateien.
 *
 * Bewusst ohne Alt-Formate wie .xls (BIFF): Statt einer unsicheren
 * Bibliothek bekommt der Benutzer einen klaren Hinweis, die Datei in
 * Excel einmal als .xlsx oder .csv zu speichern (Spec 53).
 */

export interface SheetData {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  sheetName?: string;
  /** Anzahl Zeilen, die vollständig leer waren und übersprungen wurden. */
  skippedEmpty: number;
}

export class ImportError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string, technical?: string) {
    super(technical ?? userMessage);
    this.name = 'ImportError';
    this.userMessage = userMessage;
  }
}

/** Trennt eine CSV-Zeile RFC-4180-konform (Anfuehrungszeichen, doppelte Quotes). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((v) => v.trim());
}

export function detectDelimiter(sample: string): string {
  const candidates = [';', ',', '\t', '|'];
  let best = ';';
  let bestCount = -1;
  const firstLine = sample.split(/\r?\n/)[0] ?? '';
  for (const c of candidates) {
    const count = splitCsvLine(firstLine, c).length;
    if (count > bestCount) { bestCount = count; best = c; }
  }
  return best;
}

export function parseCsv(content: string, delimiter?: string): SheetData {
  // BOM entfernen – Excel schreibt ihn bei "CSV UTF-8" mit.
  const text = content.replace(/^﻿/, '');
  const sep = delimiter ?? detectDelimiter(text);
  const lines = text.split(/\r?\n/);

  const headerIndex = lines.findIndex((l) => l.trim().length > 0);
  if (headerIndex < 0) throw new ImportError('Die Datei enthält keine Daten.');

  const headers = dedupeHeaders(splitCsvLine(lines[headerIndex]!, sep));
  const rows: Array<Record<string, unknown>> = [];
  let skippedEmpty = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) { skippedEmpty++; continue; }
    const values = splitCsvLine(line, sep);
    const row: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((h, idx) => {
      const v = values[idx] ?? '';
      row[h] = v;
      if (v !== '') hasValue = true;
    });
    if (!hasValue) { skippedEmpty++; continue; }
    rows.push(row);
  }

  return { headers, rows, skippedEmpty };
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, idx) => {
    const base = h.trim() || `Spalte ${idx + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

/** Liest eine XLSX-Datei. Nur auf dem Server verwendbar. */
export async function parseXlsx(buffer: Buffer, sheetName?: string): Promise<SheetData> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (error) {
    throw new ImportError(
      'Die Datei konnte nicht gelesen werden. Bitte speichern Sie sie in Excel als .xlsx oder .csv und laden Sie sie erneut hoch.',
      error instanceof Error ? error.message : String(error),
    );
  }

  const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!sheet) throw new ImportError('Die Datei enthält kein lesbares Tabellenblatt.');

  // Kopfzeile ist die erste Zeile mit mindestens zwei befuellten Zellen.
  let headerRowNumber = 0;
  let headers: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (headerRowNumber) return;
    const values = rowValues(row);
    if (values.filter((v) => String(v ?? '').trim() !== '').length >= 2) {
      headerRowNumber = rowNumber;
      headers = dedupeHeaders(values.map((v, i) => String(v ?? '').trim() || `Spalte ${i + 1}`));
    }
  });
  if (!headerRowNumber) throw new ImportError('Die Datei enthält keine Kopfzeile mit Spaltennamen.');

  const rows: Array<Record<string, unknown>> = [];
  let skippedEmpty = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const values = rowValues(row);
    const record: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((h, idx) => {
      const value = normalizeCell(values[idx]);
      record[h] = value;
      if (value !== null && value !== '') hasValue = true;
    });
    if (!hasValue) { skippedEmpty++; return; }
    rows.push(record);
  });

  return { headers, rows, sheetName: sheet.name, skippedEmpty };
}

function rowValues(row: { values: unknown }): unknown[] {
  // ExcelJS liefert einen 1-basierten Array – Index 0 ist immer leer.
  const raw = row.values as unknown[];
  return Array.isArray(raw) ? raw.slice(1) : [];
}

/** ExcelJS gibt Formeln, Hyperlinks und Rich-Text als Objekte zurück. */
function normalizeCell(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('result' in obj) return normalizeCell(obj.result);
    if ('text' in obj) return String(obj.text);
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return obj.richText.map((part) => String((part as { text?: string }).text ?? '')).join('');
    }
    if ('hyperlink' in obj) return String(obj.text ?? obj.hyperlink);
    return String(value);
  }
  return value;
}

/** Wählt anhand des Dateinamens den passenden Leser. */
export async function parseSpreadsheet(fileName: string, buffer: Buffer): Promise<SheetData> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt') || lower.endsWith('.tsv')) {
    return parseCsv(buffer.toString('utf8'));
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    return parseXlsx(buffer);
  }
  if (lower.endsWith('.xls')) {
    throw new ImportError(
      'Das alte Excel-Format (.xls) wird nicht unterstützt. Bitte in Excel über "Speichern unter" als .xlsx oder .csv sichern.',
    );
  }
  throw new ImportError('Nicht unterstütztes Dateiformat. Erlaubt sind .xlsx, .xlsm und .csv.');
}
