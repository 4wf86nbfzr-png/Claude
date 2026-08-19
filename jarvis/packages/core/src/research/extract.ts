import { decodeEntities, htmlToText, normalizeWhitespace, registrableDomain, truncate } from '../util/text.js';
import type { FetchedPage } from './fetcher.js';

/**
 * Extraktion aus einer geladenen Seite.
 *
 * Regel des Projekts: hier wird nur gefunden, was tatsaechlich auf der Seite
 * steht. Es wird nichts ergaenzt, geraten oder aus einem Namensschema
 * abgeleitet. Was hier nicht herauskommt, gilt als nicht vorhanden.
 */

export interface FoundEmail {
  address: string;
  /** Textstelle rund um den Fund -- wird als Beleg gespeichert. */
  context: string;
  /** Stand die Adresse in einem mailto:-Link? Das ist der staerkste Beleg. */
  fromMailto: boolean;
}

export interface ObfuscatedEmail {
  /** So stand es auf der Seite, z.B. "info (at) firma . de". */
  raw: string;
  context: string;
}

export interface FoundPhone {
  number: string;
  context: string;
}

export interface FoundPerson {
  name: string;
  role: string | null;
  context: string;
}

export interface PageExtract {
  emails: FoundEmail[];
  obfuscatedEmails: ObfuscatedEmail[];
  phones: FoundPhone[];
  people: FoundPerson[];
  postalAddress: { street: string | null; postalCode: string | null; city: string | null };
  /** Kandidaten fuer Impressum/Kontakt, absolut aufgeloest. */
  legalLinks: Array<{ url: string; kind: 'impressum' | 'kontakt' | 'ueber-uns' }>;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Bilder, Assets und Beispieladressen, die nie ein echter Kontakt sind. */
const EMAIL_BLOCKLIST =
  /\.(png|jpe?g|gif|webp|svg|css|js|woff2?|ttf|ico)$|^(beispiel|example|muster|test|noreply|no-reply|donotreply|postmaster|abuse|hostmaster|webmaster@example)/i;

export function extractFromPage(page: FetchedPage): PageExtract {
  const text = page.text;
  return {
    emails: extractEmails(page.html, text),
    obfuscatedEmails: extractObfuscatedEmails(text),
    phones: extractPhones(text),
    people: extractPeople(text),
    postalAddress: extractPostalAddress(text),
    legalLinks: extractLegalLinks(page.html, page.finalUrl),
  };
}

export function extractEmails(html: string, text: string): FoundEmail[] {
  const found = new Map<string, FoundEmail>();

  // 1. mailto:-Links -- der belastbarste Fund.
  const mailtoRe = /href\s*=\s*["']mailto:([^"'?]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html))) {
    const raw = decodeEntities(decodeURIComponentSafe(m[1] ?? '')).trim().toLowerCase();
    if (!isUsableEmail(raw)) continue;
    found.set(raw, { address: raw, context: 'mailto-Verweis auf der Seite', fromMailto: true });
  }

  // 2. Im sichtbaren Text.
  let t: RegExpExecArray | null;
  const re = new RegExp(EMAIL_RE.source, 'g');
  while ((t = re.exec(text))) {
    const raw = (t[0] ?? '').trim().toLowerCase().replace(/[.,;:]$/, '');
    if (!isUsableEmail(raw)) continue;
    if (found.has(raw)) continue;
    found.set(raw, {
      address: raw,
      context: contextAround(text, t.index, raw.length),
      fromMailto: false,
    });
  }

  return [...found.values()];
}

/**
 * Erkennt bewusst verschleierte Adressen ("info (at) firma . de").
 *
 * Diese werden *nicht* automatisch aufgeloest und verwendet: die
 * Verschleierung ist ein deutliches Zeichen, dass der Betreiber keine
 * maschinelle Erfassung wuenscht. JARVIS zeigt den Fund an und ueberlaesst
 * die Entscheidung dem Nutzer.
 */
export function extractObfuscatedEmails(text: string): ObfuscatedEmail[] {
  const re =
    /[A-Za-z0-9._%+-]{2,}\s*(?:\(at\)|\[at\]|\{at\}|\bat\b|@)\s*[A-Za-z0-9-]{2,}(?:\s*(?:\(dot\)|\[dot\]|\bdot\b|\bpunkt\b|\.)\s*[A-Za-z0-9-]{2,})+/gi;
  const out: ObfuscatedEmail[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) && out.length < 10) {
    const treffer = m[0] ?? '';
    // Ohne Leerzeichen ist es eine ganz normale Adresse -- die faellt
    // in extractEmails, nicht hierher.
    if (!/\s/.test(treffer)) continue;
    const raw = normalizeWhitespace(treffer);
    out.push({ raw, context: contextAround(text, m.index, treffer.length) });
  }
  return out;
}

export function extractPhones(text: string): FoundPhone[] {
  // Deutsche Schreibweisen: +49 40 1234567, 040/1234567, (040) 123 45 67
  const re = /(?:\+49|0)[\s\-/()]*\d(?:[\s\-/().]*\d){6,14}/g;
  const seen = new Set<string>();
  const out: FoundPhone[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < 8) {
    const raw = (m[0] ?? '').trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 16) continue;
    // Datumsangaben und Postleitzahlreihen aussortieren.
    if (/^\d{4}$/.test(digits)) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    out.push({ number: normalizeWhitespace(raw), context: contextAround(text, m.index, raw.length) });
  }
  return out;
}

const ROLE_WORDS = [
  'Geschäftsführer',
  'Geschäftsführerin',
  'Geschäftsführung',
  'Inhaber',
  'Inhaberin',
  'Vorstand',
  'Prokurist',
  'Prokuristin',
  'Niederlassungsleiter',
  'Niederlassungsleiterin',
  'Betriebsleiter',
  'Betriebsleiterin',
  'Bauleiter',
  'Bauleiterin',
  'Projektleiter',
  'Projektleiterin',
  'Einkauf',
  'Einkaufsleitung',
  'Ansprechpartner',
  'Ansprechpartnerin',
  'Vertrieb',
  'Vertriebsleitung',
];

/**
 * Personen mit Funktion. Bewusst konservativ: nur wenn eine Funktion in der
 * Naehe eines Namens steht, wird die Person uebernommen. Lieber keine
 * Person als eine falsche.
 */
export function extractPeople(text: string): FoundPerson[] {
  const out: FoundPerson[] = [];
  const seen = new Set<string>();
  const namePattern = '((?:Dr\\.|Prof\\.|Dipl\\.-Ing\\.)?\\s*[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?(?:\\s+(?:von|van|de|zu)\\s+)?\\s+[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?)';

  for (const role of ROLE_WORDS) {
    // "Geschäftsführer: Max Mustermann" und "Max Mustermann, Geschäftsführer"
    for (const re of [
      new RegExp(`${role}\\s*(?:in)?\\s*[:\\-–]\\s*${namePattern}`, 'g'),
      new RegExp(`${namePattern}\\s*[,(]\\s*${role}`, 'g'),
    ]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) && out.length < 12) {
        const name = normalizeWhitespace(m[1] ?? '');
        if (!name || name.split(/\s+/).length < 2) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name, role, context: contextAround(text, m.index, (m[0] ?? '').length) });
      }
    }
  }
  return out;
}

export function extractPostalAddress(text: string): { street: string | null; postalCode: string | null; city: string | null } {
  // "Musterstraße 12, 20095 Hamburg" bzw. ueber zwei Zeilen
  const re = /([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{2,40}?\s+\d{1,4}\s*[a-zA-Z]?)\s*[,\n]\s*(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{1,40})/;
  const m = re.exec(text);
  if (!m) {
    const plzOnly = /\b(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{1,40})/.exec(text);
    return plzOnly
      ? { street: null, postalCode: plzOnly[1] ?? null, city: normalizeWhitespace(plzOnly[2] ?? '') || null }
      : { street: null, postalCode: null, city: null };
  }
  return {
    street: normalizeWhitespace(m[1] ?? '') || null,
    postalCode: m[2] ?? null,
    city: normalizeWhitespace(m[3] ?? '') || null,
  };
}

export function extractLegalLinks(
  html: string,
  baseUrl: string,
): Array<{ url: string; kind: 'impressum' | 'kontakt' | 'ueber-uns' }> {
  const out = new Map<string, { url: string; kind: 'impressum' | 'kontakt' | 'ueber-uns' }>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html))) {
    const href = m[1];
    const label = htmlToText(m[2] ?? '').toLowerCase();
    if (!href) continue;
    const haystack = `${href.toLowerCase()} ${label}`;

    let kind: 'impressum' | 'kontakt' | 'ueber-uns' | null = null;
    if (/impressum|imprint|legal-notice|rechtliches/.test(haystack)) kind = 'impressum';
    else if (/kontakt|contact|ansprechpartner/.test(haystack)) kind = 'kontakt';
    else if (/ueber-uns|über uns|about|unternehmen|team/.test(haystack)) kind = 'ueber-uns';
    if (!kind) continue;

    try {
      const abs = new URL(decodeEntities(href), baseUrl);
      if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
      abs.hash = '';
      // Nur Links innerhalb derselben Domain -- fremde Impressen helfen nicht.
      if (registrableDomain(abs.hostname) !== registrableDomain(new URL(baseUrl).hostname)) continue;
      if (!out.has(abs.toString())) out.set(abs.toString(), { url: abs.toString(), kind });
    } catch {
      continue;
    }
  }

  // Impressum zuerst -- dort steht die verbindliche Angabe.
  const order = { impressum: 0, kontakt: 1, 'ueber-uns': 2 } as const;
  return [...out.values()].sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 8);
}

function isUsableEmail(address: string): boolean {
  if (!address.includes('@')) return false;
  if (address.length > 254) return false;
  if (EMAIL_BLOCKLIST.test(address)) return false;
  const [local, domain] = address.split('@');
  if (!local || !domain) return false;
  if (!/\.[a-z]{2,}$/i.test(domain)) return false;
  // Adressen mit Bindestrich-Muell aus zusammengeklebtem Markup aussortieren.
  if (/\.\./.test(address)) return false;
  return true;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function contextAround(text: string, index: number, length: number, window = 110): string {
  const start = Math.max(0, index - window);
  const end = Math.min(text.length, index + length + window);
  return truncate(normalizeWhitespace(text.slice(start, end)), 260);
}
