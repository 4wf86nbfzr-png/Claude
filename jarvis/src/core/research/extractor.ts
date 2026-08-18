import * as cheerio from 'cheerio';
import { isValidEmailSyntax, normalizeEmail, truncate } from '../util/text';

export interface GefundeneAdresse {
  address: string;
  /** Wie die Adresse auf der Seite stand. */
  method: 'mailto' | 'klartext' | 'entschluesselt';
  /** Textstelle als Beleg. */
  context: string;
}

export interface GefundenerKontakt {
  name: string;
  role: string | null;
}

export interface SeitenInfo {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  links: { href: string; text: string }[];
  emails: GefundeneAdresse[];
  phones: string[];
  postleitzahl: string | null;
  ort: string | null;
  kontakte: GefundenerKontakt[];
}

const EMAIL_IM_TEXT = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * Verschleierte Schreibweisen, wie sie auf Impressumsseiten üblich sind:
 * "info(at)firma.de", "info [at] firma [punkt] de".
 * Das ist keine Umgehung eines Schutzes, sondern das Lesen einer bewusst
 * veröffentlichten Angabe – erfunden wird dabei nichts.
 */
const VERSCHLEIERT =
  /([a-z0-9._%+-]+)\s*(?:\(|\[|&#40;)?\s*(?:at|ät|@)\s*(?:\)|\]|&#41;)?\s*([a-z0-9.-]+)\s*(?:\(|\[)?\s*(?:dot|punkt|\.)\s*(?:\)|\])?\s*([a-z]{2,})/gi;

const TELEFON = /(?:tel(?:efon)?\.?|fon|telefonnummer)\s*[:.]?\s*(\+?[\d][\d\s()/.-]{5,}\d)/gi;
const PLZ_ORT = /\b(\d{5})\s+([A-ZÄÖÜ][\wäöüß.-]+(?:[ -][A-ZÄÖÜ][\wäöüß.-]+)?)/;

const ROLLEN = [
  'Geschäftsführer',
  'Geschäftsführerin',
  'Geschäftsführung',
  'Inhaber',
  'Inhaberin',
  'Vorstand',
  'Prokurist',
  'Prokuristin',
  'Ansprechpartner',
  'Ansprechpartnerin',
  'Bauleiter',
  'Bauleiterin',
  'Projektleiter',
  'Projektleiterin',
  'Niederlassungsleiter',
  'Betriebsleiter',
  'Objektleiter'
];

/** Wandelt HTML in gut lesbaren Fließtext (ohne Skripte, Stile, Navigation). */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, iframe').remove();
  $('br').replaceWith('\n');
  $('p, div, li, tr, h1, h2, h3, h4, h5, h6').append('\n');
  return $('body').text().replace(/[ \t ]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}

/** Liest alles aus einer Seite heraus, was für die Firmenrecherche zählt. */
export function extractPageInfo(html: string, url: string): SeitenInfo {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  const text = htmlToText(html);

  const emails = new Map<string, GefundeneAdresse>();
  const merke = (address: string, method: GefundeneAdresse['method'], context: string) => {
    const normalized = normalizeEmail(address);
    if (!isValidEmailSyntax(normalized)) return;
    if (istBilddatei(normalized)) return;
    const vorhanden = emails.get(normalized);
    // mailto ist der beste Beleg, dann Klartext, dann entschlüsselt.
    const rang = { mailto: 0, klartext: 1, entschluesselt: 2 } as const;
    if (!vorhanden || rang[method] < rang[vorhanden.method]) {
      emails.set(normalized, { address: normalized, method, context: truncate(context, 200) });
    }
  };

  $('a[href^="mailto:"]').each((_, element) => {
    const href = $(element).attr('href') ?? '';
    const address = href.slice('mailto:'.length).split('?')[0] ?? '';
    const umfeld = $(element).closest('p, li, div, td, footer, section').text() || $(element).text();
    merke(address, 'mailto', umfeld || href);
  });

  for (const treffer of text.matchAll(EMAIL_IM_TEXT)) {
    merke(treffer[0], 'klartext', umgebung(text, treffer.index ?? 0));
  }

  for (const treffer of text.matchAll(VERSCHLEIERT)) {
    const [ganz, lokal, domain, tld] = treffer;
    if (!lokal || !domain || !tld) continue;
    if (ganz.includes('@') && isValidEmailSyntax(ganz.trim())) continue;
    merke(`${lokal}@${domain}.${tld}`, 'entschluesselt', umgebung(text, treffer.index ?? 0));
  }

  const phones = new Set<string>();
  for (const treffer of text.matchAll(TELEFON)) {
    const nummer = treffer[1]?.replace(/[\s.]+/g, ' ').trim();
    if (nummer && nummer.replace(/\D/g, '').length >= 7) phones.add(nummer);
  }
  $('a[href^="tel:"]').each((_, element) => {
    const nummer = ($(element).attr('href') ?? '').slice('tel:'.length).trim();
    if (nummer) phones.add(nummer);
  });

  const plzOrt = PLZ_ORT.exec(text);

  return {
    url,
    title: $('title').first().text().trim() || null,
    description: $('meta[name="description"]').attr('content')?.trim() || null,
    text,
    links: sammleLinks($, url),
    emails: [...emails.values()],
    phones: [...phones],
    postleitzahl: plzOrt?.[1] ?? null,
    ort: plzOrt?.[2] ?? null,
    kontakte: extractKontakte(text)
  };
}

function sammleLinks($: cheerio.CheerioAPI, base: string): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = [];
  const gesehen = new Set<string>();
  $('a[href]').each((_, element) => {
    const raw = $(element).attr('href') ?? '';
    if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) return;
    try {
      const absolut = new URL(raw, base).toString().split('#')[0] ?? '';
      if (!absolut || gesehen.has(absolut)) return;
      gesehen.add(absolut);
      links.push({ href: absolut, text: $(element).text().replace(/\s+/g, ' ').trim() });
    } catch {
      // Kaputte Links überspringen.
    }
  });
  return links;
}

/** Namen mit Funktion, wie sie im Impressum oder auf Teamseiten stehen. */
export function extractKontakte(text: string): GefundenerKontakt[] {
  const gefunden = new Map<string, GefundenerKontakt>();
  const name = '([A-ZÄÖÜ][a-zäöüß-]+(?:\\s+(?:von|van|de|der))?\\s+[A-ZÄÖÜ][a-zäöüß-]+)';
  for (const rolle of ROLLEN) {
    // Anreden und Titel vor dem Namen überspringen ("Geschäftsführer: Dr. Klaus Meier").
    const titel = '(?:Herr|Frau|Dr\\.|Prof\\.|Dipl\\.[-\\w.]*|M\\.\\s?Sc\\.|B\\.\\s?Sc\\.)';
    const nachRolle = new RegExp(`${rolle}[a-zäöüß]*\\s*[:\\-–]?\\s*(?:${titel}\\s*)*${name}`, 'g');
    const vorRolle = new RegExp(`${name}\\s*[,\\-–(]\\s*${rolle}`, 'g');
    for (const regex of [nachRolle, vorRolle]) {
      for (const treffer of text.matchAll(regex)) {
        const person = treffer[1]?.replace(/\s+/g, ' ').trim();
        if (!person || person.split(' ').length < 2) continue;
        if (!gefunden.has(person)) gefunden.set(person, { name: person, role: rolle });
      }
    }
  }
  return [...gefunden.values()].slice(0, 8);
}

/** Findet die typischen Unterseiten, auf denen Kontaktangaben stehen. */
export function findeKontaktseiten(links: { href: string; text: string }[], basis: string): string[] {
  const muster = [
    /impressum/i,
    /kontakt/i,
    /contact/i,
    /ansprechpartner/i,
    /ueber-uns|über-uns|about|unternehmen/i,
    /team/i,
    /legal-notice/i
  ];
  let basisHost = '';
  try {
    basisHost = new URL(basis).host.replace(/^www\./, '');
  } catch {
    basisHost = '';
  }
  const treffer: string[] = [];
  for (const muster_ of muster) {
    for (const link of links) {
      let host = '';
      try {
        host = new URL(link.href).host.replace(/^www\./, '');
      } catch {
        continue;
      }
      if (basisHost && host !== basisHost) continue;
      if (muster_.test(link.href) || muster_.test(link.text)) {
        if (!treffer.includes(link.href)) treffer.push(link.href);
        break;
      }
    }
  }
  return treffer;
}

/** Seitenart anhand der Adresse – bestimmt später die Beweiskraft. */
export function seitenArt(url: string): 'impressum' | 'kontakt' | 'website' {
  const wert = url.toLowerCase();
  if (/impressum|legal-notice|imprint/.test(wert)) return 'impressum';
  if (/kontakt|contact|ansprechpartner/.test(wert)) return 'kontakt';
  return 'website';
}

const umgebung = (text: string, index: number, radius = 90): string =>
  text.slice(Math.max(0, index - radius), Math.min(text.length, index + radius));

const istBilddatei = (address: string): boolean => /\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(address);
