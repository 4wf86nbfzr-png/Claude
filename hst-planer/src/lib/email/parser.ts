/**
 * Regelbasierter Parser fuer Personalanfragen (Spec 18).
 *
 * Der Parser liest deutschsprachige Freitext-E-Mails und erzeugt daraus
 * strukturierte Felder. Er arbeitet bewusst konservativ:
 *   * Wird ein Wert nicht sicher erkannt, bleibt das Feld leer.
 *   * Jedes Feld traegt eine Konfidenz, damit die Disposition sieht,
 *     worauf sie schauen muss.
 *   * Es entsteht niemals eine Buchung, immer nur eine Anfrage zur Pruefung.
 *
 * Eine optionale KI-Anreicherung (src/lib/email/ai.ts) darf nur Felder
 * ergaenzen, die hier leer geblieben sind – nie vorhandene ueberschreiben.
 */

import { formatMinutes, isoDate, parseGermanDate, parseTimeToMinutes } from '../time';

export interface ParsedField<T> {
  value: T | null;
  confidence: number;
  /** Textstelle, aus der der Wert stammt – hilft beim Nachvollziehen. */
  evidence?: string;
}

export interface ParsedRequest {
  company: ParsedField<string>;
  contactPerson: ParsedField<string>;
  email: ParsedField<string>;
  phone: ParsedField<string>;
  eventName: ParsedField<string>;
  eventDate: ParsedField<string>;   // ISO "YYYY-MM-DD"
  startTime: ParsedField<string>;   // "HH:MM"
  endTime: ParsedField<string>;
  meetingTime: ParsedField<string>;
  location: ParsedField<string>;
  employeesNeeded: ParsedField<number>;
  serviceType: ParsedField<string>;
  message: string;
  missingFields: string[];
  confidence: number;
  /** true, wenn der Text ueberhaupt nach einer Personalanfrage aussieht. */
  isRequest: boolean;
}

export interface ParseInput {
  subject?: string | null;
  body: string;
  fromName?: string | null;
  fromEmail?: string | null;
  referenceDate?: Date;
}

const SERVICE_KEYWORDS: Array<{ code: string; words: string[] }> = [
  { code: 'SICHERHEIT', words: ['sicherheit', 'security', 'sicherheitskraft', 'sicherheitskraefte', 'sicherheitsdienst', 'ordnungsdienst', 'ordner', 'doorman', 'einlass', 'objektschutz', 'werkschutz', 'revier'] },
  { code: 'GASTRO', words: ['gastro', 'service', 'servicekraft', 'servicekraefte', 'kellner', 'barkeeper', 'tresen', 'thekenkraft', 'spuelkraft', 'buffet', 'catering'] },
  { code: 'PROMOTION', words: ['promotion', 'hostess', 'hostessen', 'promoter', 'messehostess', 'garderobe', 'empfang'] },
  { code: 'LOGISTIK', words: ['logistik', 'lager', 'kommissionier', 'stapler', 'auf- und abbau', 'aufbau', 'abbau', 'helfer', 'umzug'] },
  { code: 'FAHRSERVICE', words: ['fahrservice', 'fahrer', 'chauffeur', 'shuttle', 'transfer'] },
  { code: 'REINIGUNG', words: ['reinigung', 'reinigungskraft', 'reinigungskraefte', 'unterhaltsreinigung', 'grundreinigung', 'eventreinigung', 'putz'] },
];

const REQUEST_SIGNALS = [
  'anfrage', 'benoetigen', 'benoetige', 'brauchen', 'brauche', 'personal', 'mitarbeiter',
  'unterstuetzung', 'angebot', 'veranstaltung', 'event', 'einsatz', 'buchen', 'kraefte',
  'sicherheitskraefte', 'servicekraefte', 'hostessen', 'bewachung',
];

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, fünf: 5, sechs: 6,
  sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12, zwölf: 12,
  dreizehn: 13, vierzehn: 14, fuenfzehn: 15, fünfzehn: 15, zwanzig: 20, dreissig: 30, dreißig: 30,
};

/** Grussformeln und Signaturen abschneiden – dort stehen keine Auftragsdaten. */
const SIGNATURE_MARKERS = [
  /\n\s*(viele|beste|freundliche|herzliche)\s+gr[uü](ss|ß)e/i,
  /\n\s*mit freundlichen gr[uü](ss|ß)en/i,
  /\n\s*-{2,}\s*\n/,
  /\n\s*von meinem (iphone|ipad|android)/i,
];

export function stripSignature(body: string): string {
  let cut = body.length;
  for (const marker of SIGNATURE_MARKERS) {
    const m = body.match(marker);
    if (m?.index != null && m.index < cut) cut = m.index;
  }
  return body.slice(0, cut);
}

/** Zitierte Vorgaenger-Mails ("> ...", "Am ... schrieb ...") entfernen. */
export function stripQuotes(body: string): string {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;
    if (/^\s*am .+ schrieb .+:\s*$/i.test(line)) break;
    if (/^\s*-{3,}\s*urspr[uü]ngliche nachricht\s*-{3,}\s*$/i.test(line)) break;
    if (/^\s*von:\s*.+@/i.test(line) && out.length > 3) break;
    out.push(line);
  }
  return out.join('\n');
}

export function parseRequestEmail(input: ParseInput): ParsedRequest {
  const reference = input.referenceDate ?? new Date();
  const subject = (input.subject ?? '').trim();
  const cleanBody = stripSignature(stripQuotes(input.body ?? '')).trim();
  const haystack = `${subject}\n${cleanBody}`;
  const lower = normalize(haystack);

  const result: ParsedRequest = {
    company: empty(), contactPerson: empty(), email: empty(), phone: empty(),
    eventName: empty(), eventDate: empty(), startTime: empty(), endTime: empty(),
    meetingTime: empty(), location: empty(), employeesNeeded: empty(), serviceType: empty(),
    message: cleanBody,
    missingFields: [],
    confidence: 0,
    isRequest: false,
  };

  result.isRequest = REQUEST_SIGNALS.filter((w) => lower.includes(w)).length >= 2;

  // --- Kontakt ------------------------------------------------------------
  if (input.fromEmail) result.email = { value: input.fromEmail.toLowerCase(), confidence: 1, evidence: 'Absender' };
  else {
    const mail = haystack.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (mail) result.email = { value: mail[0].toLowerCase(), confidence: 0.8, evidence: mail[0] };
  }

  if (input.fromName?.trim()) {
    result.contactPerson = { value: input.fromName.trim(), confidence: 0.7, evidence: 'Absender' };
  }
  const signed = input.body?.match(/gr[uü](?:ss|ß)e?\s*[,\n]+\s*([A-ZÄÖÜ][\wäöüß-]+(?:\s+[A-ZÄÖÜ][\wäöüß-]+){0,2})/);
  if (signed?.[1]) result.contactPerson = { value: signed[1].trim(), confidence: 0.85, evidence: signed[0] };

  const phone = haystack.match(/(?:tel\.?|telefon|mobil|handy)[:\s]*(\+?[\d\s()/-]{6,})/i)
    ?? haystack.match(/(\+49[\d\s()/-]{6,}|0\d{2,5}[\s/-]?\d{3,}[\d\s/-]*)/);
  if (phone?.[1]) {
    const cleaned = phone[1].replace(/\s+/g, ' ').trim();
    if (cleaned.replace(/\D/g, '').length >= 7) {
      result.phone = { value: cleaned, confidence: 0.75, evidence: phone[0] };
    }
  }

  const company = haystack.match(/\b([A-ZÄÖÜ][\wäöüß&.\- ]{2,40}?\s+(?:GmbH(?:\s*&\s*Co\.?\s*KG)?|AG|KG|e\.?\s?K\.?|UG(?:\s*\(haftungsbeschr[aä]nkt\))?|e\.?\s?V\.?|OHG|SE))/);
  if (company?.[1]) result.company = { value: company[1].replace(/\s+/g, ' ').trim(), confidence: 0.8, evidence: company[0] };
  else if (result.email.value) {
    const domain = result.email.value.split('@')[1] ?? '';
    const free = ['gmail.com', 'web.de', 'gmx.de', 'gmx.net', 'outlook.com', 'hotmail.com', 'yahoo.de', 't-online.de', 'icloud.com', 'posteo.de', 'mail.de'];
    if (domain && !free.includes(domain)) {
      const base = domain.split('.')[0] ?? '';
      if (base.length > 2) {
        result.company = { value: base.charAt(0).toUpperCase() + base.slice(1), confidence: 0.4, evidence: domain };
      }
    }
  }

  // --- Datum --------------------------------------------------------------
  const dateMatch = findDate(haystack, reference);
  if (dateMatch) result.eventDate = dateMatch;

  // --- Zeiten -------------------------------------------------------------
  const span = findTimeSpan(haystack);
  if (span) {
    result.startTime = { value: span.start, confidence: span.confidence, evidence: span.evidence };
    if (span.end) result.endTime = { value: span.end, confidence: span.confidence, evidence: span.evidence };
  }

  const meeting = haystack.match(/(?:treffpunkt|treffen|treffzeit|anwesend|vor ort)[^.\n]{0,40}?(\d{1,2}(?:[:.]\d{2})?)\s*(?:uhr)?/i);
  if (meeting?.[1]) {
    const minutes = parseTimeToMinutes(meeting[1]);
    if (minutes != null) result.meetingTime = { value: formatMinutes(minutes), confidence: 0.8, evidence: meeting[0].trim() };
  }

  // --- Anzahl Mitarbeiter -------------------------------------------------
  const count = findEmployeeCount(haystack);
  if (count) result.employeesNeeded = count;

  // --- Leistungsart -------------------------------------------------------
  let bestService: { code: string; hits: number } | null = null;
  for (const entry of SERVICE_KEYWORDS) {
    const hits = entry.words.filter((w) => lower.includes(w)).length;
    if (hits > 0 && (!bestService || hits > bestService.hits)) bestService = { code: entry.code, hits };
  }
  if (bestService) {
    result.serviceType = { value: bestService.code, confidence: Math.min(0.95, 0.6 + bestService.hits * 0.15) };
  }

  // --- Ort ----------------------------------------------------------------
  const location = findLocation(haystack);
  if (location) result.location = location;

  // --- Eventname ----------------------------------------------------------
  if (subject) {
    const cleanedSubject = subject
      .replace(/^(aw|re|fwd?|wg)\s*:\s*/i, '')
      .replace(/\b(anfrage|personalanfrage|kontaktformular|angebot)\b\s*[:–-]?\s*/gi, '')
      .trim();
    if (cleanedSubject.length >= 3) {
      result.eventName = { value: cleanedSubject, confidence: 0.6, evidence: 'Betreff' };
    }
  }

  // --- Vollstaendigkeit ---------------------------------------------------
  const required: Array<[keyof ParsedRequest, string]> = [
    ['eventDate', 'Datum'],
    ['startTime', 'Startzeit'],
    ['endTime', 'Endzeit'],
    ['location', 'Ort'],
    ['employeesNeeded', 'Anzahl Mitarbeiter'],
    ['serviceType', 'Leistungsart'],
    ['contactPerson', 'Ansprechpartner'],
  ];
  const confidences: number[] = [];
  for (const [key, label] of required) {
    const field = result[key] as ParsedField<unknown>;
    if (field.value == null) result.missingFields.push(label);
    else confidences.push(field.confidence);
  }
  result.confidence = confidences.length
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / required.length) * 100) / 100
    : 0;

  return result;
}

// ------------------------------------------------------------------ Hilfen

function empty<T>(): ParsedField<T> {
  return { value: null, confidence: 0 };
}

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

function findDate(text: string, reference: Date): ParsedField<string> | null {
  const patterns: Array<{ re: RegExp; confidence: number }> = [
    { re: /\b(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})\b/, confidence: 0.95 },
    { re: /\b(\d{4}-\d{2}-\d{2})\b/, confidence: 0.95 },
    { re: /\b(\d{1,2}\.\s?\d{1,2}\.)(?!\d)/, confidence: 0.8 },
    { re: /\b(\d{1,2}\.?\s+(?:januar|februar|m[aä]rz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+\d{4})?)\b/i, confidence: 0.9 },
  ];
  for (const { re, confidence } of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const parsed = parseGermanDate(m[1].replace(/\s+/g, ' ').trim(), reference);
    if (parsed) return { value: isoDate(parsed), confidence, evidence: m[0] };
  }
  // "morgen" / "uebermorgen"
  const lower = normalize(text);
  if (/\bmorgen\b/.test(lower) && !/\buebermorgen\b/.test(lower)) {
    return { value: isoDate(new Date(reference.getTime() + 86400000)), confidence: 0.5, evidence: 'morgen' };
  }
  return null;
}

interface TimeSpan { start: string; end: string | null; confidence: number; evidence: string }

function findTimeSpan(text: string): TimeSpan | null {
  const patterns: RegExp[] = [
    /(?:von|ab|zwischen)\s*(\d{1,2}(?:[:.]\d{2})?)\s*(?:uhr)?\s*(?:bis|-|–|—|und)\s*(\d{1,2}(?:[:.]\d{2})?)\s*(?:uhr)?/i,
    /(\d{1,2}(?:[:.]\d{2})?)\s*(?:uhr)?\s*(?:bis|-|–|—)\s*(\d{1,2}(?:[:.]\d{2})?)\s*uhr/i,
    /(\d{1,2}[:.]\d{2})\s*(?:-|–|—|bis)\s*(\d{1,2}[:.]\d{2})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const start = parseTimeToMinutes(m[1]);
    const end = m[2] ? parseTimeToMinutes(m[2]) : null;
    if (start == null) continue;
    return {
      start: formatMinutes(start),
      end: end == null ? null : formatMinutes(end),
      confidence: 0.9,
      evidence: m[0].trim(),
    };
  }
  const single = text.match(/\bab\s*(\d{1,2}(?:[:.]\d{2})?)\s*uhr\b/i);
  if (single?.[1]) {
    const start = parseTimeToMinutes(single[1]);
    if (start != null) return { start: formatMinutes(start), end: null, confidence: 0.7, evidence: single[0].trim() };
  }
  return null;
}

function findEmployeeCount(text: string): ParsedField<number> | null {
  const unitWords = 'mitarbeiter|mitarbeitende|kr[aä]fte|kraft|personen|leute|sicherheitskr[aä]fte|servicekr[aä]fte|hostessen|hostess|ordner|fahrer|helfer|reinigungskr[aä]fte|personal';
  const numeric = text.match(new RegExp(`\\b(\\d{1,3})\\s*(?:x\\s*)?(?:${unitWords})`, 'i'));
  if (numeric?.[1]) {
    const n = Number(numeric[1]);
    if (n > 0 && n <= 999) return { value: n, confidence: 0.9, evidence: numeric[0].trim() };
  }
  const reversed = text.match(new RegExp(`(?:${unitWords})\\s*[:\\s]\\s*(\\d{1,3})\\b`, 'i'));
  if (reversed?.[1]) {
    const n = Number(reversed[1]);
    if (n > 0 && n <= 999) return { value: n, confidence: 0.85, evidence: reversed[0].trim() };
  }
  const worded = normalize(text).match(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\s+(?:${normalize(unitWords)})`, 'i'));
  if (worded?.[1]) {
    const n = NUMBER_WORDS[worded[1].toLowerCase()];
    if (n) return { value: n, confidence: 0.7, evidence: worded[0].trim() };
  }
  return null;
}

function findLocation(text: string): ParsedField<string> | null {
  const labelled = text.match(/(?:veranstaltungsort|einsatzort|ort|location|adresse)\s*[:\-]\s*([^\n]{3,80})/i);
  if (labelled?.[1]) return { value: labelled[1].trim().replace(/[.;,]$/, ''), confidence: 0.9, evidence: labelled[0].trim() };

  const inPlace = text.match(/\bin\s+((?:der\s+|dem\s+)?[A-ZÄÖÜ][\wäöüß.-]+(?:[\s-][A-ZÄÖÜ][\wäöüß.-]+){0,3})/);
  if (inPlace?.[1]) {
    const value = inPlace[1].trim();
    // Wochentage und Monatsnamen sind keine Orte.
    if (!/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Januar|Februar|M[aä]rz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)$/i.test(value)) {
      return { value, confidence: 0.6, evidence: inPlace[0].trim() };
    }
  }
  const zip = text.match(/\b(\d{5})\s+([A-ZÄÖÜ][\wäöüß-]+)/);
  if (zip) return { value: `${zip[1]} ${zip[2]}`, confidence: 0.7, evidence: zip[0] };
  return null;
}
