import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { ValidationError } from "../../core/errors";
import { localToUtc } from "@/lib/tz";

export type ParsedRow = {
  row: number;
  employeeNumber: string;
  startedAt: Date;
  endedAt: Date;
  breakMinutes: number;
  raw: Record<string, unknown>;
};

export type ParseResult = { rows: ParsedRow[]; errors: { row: number; message: string }[]; columnMapping: Record<string, string>; totalRows: number };

const ALIASES: Record<string, string[]> = {
  employeeNumber: ["employee_number", "employee", "mitarbeiter_id", "mitarbeiterid", "mitarbeiternummer", "personalnummer", "persnr", "pnr", "id", "mitarbeiter"],
  date: ["date", "datum", "tag"],
  start: ["start", "beginn", "von", "start_time", "startzeit", "kommen", "begin", "started_at", "beginn_zeit"],
  end: ["end", "ende", "bis", "end_time", "endzeit", "gehen", "ended_at", "ende_zeit"],
  break: ["break", "pause", "break_minutes", "pause_min", "pausenminuten", "pausen"],
  endDate: ["end_date", "enddatum", "datum_ende"],
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function detectMapping(headers: string[], override: Record<string, string> = {}): Record<string, string> {
  const normalized = headers.map(norm);
  const mapping: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    if (override[field]) {
      mapping[field] = override[field]!;
      continue;
    }
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) mapping[field] = headers[idx]!;
  }
  return mapping;
}

/** Zeitangabe "HH:mm" oder "HH:mm:ss" oder Zahl (Excel-Bruchteil) in Minuten seit Mitternacht. */
function parseTime(v: unknown): number | null {
  if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();
  if (typeof v === "number") return Math.round((v % 1) * 24 * 60);
  const s = String(v ?? "").trim();
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}

/** Datum "YYYY-MM-DD", "DD.MM.YYYY", Excel-Datum oder Date. */
function parseDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  }
  return null;
}

/** Vollständiger Zeitstempel (ISO oder "DD.MM.YYYY HH:mm"). */
function parseDateTime(v: unknown, tz: string): Date | null {
  if (v instanceof Date) return v;
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? d : localToUtc(s.slice(0, 16), tz);
  }
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/.exec(s);
  if (m) return localToUtc(`${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T${m[4]!.padStart(2, "0")}:${m[5]}`, tz);
  return null;
}

function toRows(headers: string[], records: Record<string, unknown>[], mapping: Record<string, string>, tz: string): ParseResult {
  const errors: ParseResult["errors"] = [];
  const rows: ParsedRow[] = [];
  const missing = ["employeeNumber", "start", "end"].filter((f) => !mapping[f]);
  if (missing.length) throw new ValidationError(`Spalten nicht erkannt: ${missing.join(", ")}. Erkannte Spalten: ${headers.join(", ")}`);
  records.forEach((r, i) => {
    const rowNo = i + 2;
    const employeeNumber = String(r[mapping.employeeNumber!] ?? "").trim();
    if (!employeeNumber) {
      errors.push({ row: rowNo, message: "Mitarbeiterkennung fehlt" });
      return;
    }
    let startedAt: Date | null = null;
    let endedAt: Date | null = null;
    const startRaw = r[mapping.start!];
    const endRaw = r[mapping.end!];
    const dateRaw = mapping.date ? r[mapping.date] : undefined;
    const date = dateRaw !== undefined ? parseDate(dateRaw) : null;
    if (date) {
      const st = parseTime(startRaw);
      const et = parseTime(endRaw);
      if (st === null || et === null) {
        errors.push({ row: rowNo, message: `Uhrzeit nicht lesbar (${String(startRaw)} / ${String(endRaw)})` });
        return;
      }
      const endDate = mapping.endDate ? parseDate(r[mapping.endDate]) ?? date : date;
      startedAt = localToUtc(`${date}T${String(Math.floor(st / 60)).padStart(2, "0")}:${String(st % 60).padStart(2, "0")}`, tz);
      endedAt = localToUtc(`${endDate}T${String(Math.floor(et / 60) % 24).padStart(2, "0")}:${String(et % 60).padStart(2, "0")}`, tz);
      if (endedAt <= startedAt) endedAt = new Date(endedAt.getTime() + 86_400_000); // über Mitternacht
    } else {
      startedAt = parseDateTime(startRaw, tz);
      endedAt = parseDateTime(endRaw, tz);
    }
    if (!startedAt || !endedAt) {
      errors.push({ row: rowNo, message: "Beginn/Ende nicht lesbar (Datum + Uhrzeit oder vollständiger Zeitstempel erwartet)" });
      return;
    }
    if (endedAt <= startedAt) {
      errors.push({ row: rowNo, message: "Ende liegt vor Beginn" });
      return;
    }
    if (endedAt.getTime() - startedAt.getTime() > 24 * 3_600_000) {
      errors.push({ row: rowNo, message: "Dauer über 24 Stunden – bitte prüfen" });
      return;
    }
    const breakRaw = mapping.break ? r[mapping.break] : 0;
    const breakMinutes = Number(String(breakRaw ?? 0).replace(",", ".")) || 0;
    rows.push({ row: rowNo, employeeNumber, startedAt, endedAt, breakMinutes: Math.max(0, Math.round(breakMinutes)), raw: r });
  });
  return { rows, errors, columnMapping: mapping, totalRows: records.length };
}

export function parseCsvTimeRecords(text: string, tz = "Europe/Berlin", override: Record<string, string> = {}): ParseResult {
  const delimiter = (text.split("\n")[0] ?? "").includes(";") ? ";" : (text.split("\n")[0] ?? "").includes("\t") ? "\t" : ",";
  let records: Record<string, unknown>[];
  try {
    records = parseCsv(text, { columns: true, delimiter, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  } catch (err) {
    throw new ValidationError(`CSV nicht lesbar: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (records.length === 0) throw new ValidationError("Keine Datenzeilen.");
  const headers = Object.keys(records[0]!);
  return toRows(headers, records, detectMapping(headers, override), tz);
}

export async function parseXlsxTimeRecords(data: Buffer, tz = "Europe/Berlin", override: Record<string, string> = {}): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    throw new ValidationError("XLSX-Datei nicht lesbar.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ValidationError("Arbeitsmappe enthält kein Tabellenblatt.");
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? "").trim();
  });
  const records: Record<string, unknown>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rec: Record<string, unknown> = {};
    let any = false;
    headers.forEach((h, idx) => {
      if (!h) return;
      const cell = row.getCell(idx + 1);
      let v: unknown = cell.value;
      if (v && typeof v === "object" && "result" in (v as object)) v = (v as { result: unknown }).result;
      if (v && typeof v === "object" && "text" in (v as object)) v = (v as { text: unknown }).text;
      if (v !== null && v !== undefined && v !== "") any = true;
      rec[h] = v;
    });
    if (any) records.push(rec);
  });
  if (records.length === 0) throw new ValidationError("Keine Datenzeilen.");
  return toRows(headers.filter(Boolean), records, detectMapping(headers.filter(Boolean), override), tz);
}
