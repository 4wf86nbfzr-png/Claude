import * as cheerio from 'cheerio';

export interface ExtractedEmail {
  address: string;
  /** `mailto` links are the strongest evidence; text hits are weaker. */
  origin: 'mailto' | 'text';
  /** Verbatim surrounding text, stored as evidence for the source record. */
  context: string;
}

export interface ExtractedLink {
  url: string;
  text: string;
}

export interface ExtractedPage {
  url: string;
  title: string;
  description: string;
  /** Readable page text with scripts, styles and navigation noise removed. */
  text: string;
  emails: ExtractedEmail[];
  phones: string[];
  links: ExtractedLink[];
  imprintLinks: string[];
  contactLinks: string[];
}

const IMPRINT_HINTS = ['impressum', 'imprint', 'legal-notice', 'legal_notice', 'anbieterkennzeichnung'];
const CONTACT_HINTS = ['kontakt', 'contact', 'ansprechpartner', 'team', 'ueber-uns', 'über-uns', 'about'];

/**
 * Turns one HTML page into the facts a researcher may quote.
 *
 * Everything here is mechanical: addresses come out of the markup verbatim.
 * The language model is never asked to produce an e-mail address — it may only
 * choose among addresses this extractor actually found (§4).
 */
export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html);

  $('script, style, noscript, svg, iframe, template').remove();

  const title = ($('title').first().text() || '').trim();
  const description = ($('meta[name="description"]').attr('content') ?? '').trim();

  const text = normalizeWhitespace($('body').text() || $.root().text());

  const emails = new Map<string, ExtractedEmail>();

  // 1. mailto: links — unambiguous, published contact addresses.
  $('a[href^="mailto:"]').each((_, element) => {
    const href = $(element).attr('href') ?? '';
    const address = decodeMailto(href);
    if (!address) return;
    const key = address.toLowerCase();
    if (!emails.has(key)) {
      emails.set(key, {
        address,
        origin: 'mailto',
        context: normalizeWhitespace($(element).parent().text()).slice(0, 240) || address,
      });
    }
  });

  // 2. addresses written out in the page text, including obfuscated forms.
  for (const match of findEmailsInText(text)) {
    const key = match.address.toLowerCase();
    if (!emails.has(key)) emails.set(key, match);
  }

  const links: ExtractedLink[] = [];
  const imprintLinks = new Set<string>();
  const contactLinks = new Set<string>();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href') ?? '';
    const absolute = toAbsolute(href, pageUrl);
    if (!absolute) return;
    const label = normalizeWhitespace($(element).text()).slice(0, 120);
    links.push({ url: absolute, text: label });

    const haystack = `${absolute.toLowerCase()} ${label.toLowerCase()}`;
    if (IMPRINT_HINTS.some((hint) => haystack.includes(hint))) imprintLinks.add(absolute);
    if (CONTACT_HINTS.some((hint) => haystack.includes(hint))) contactLinks.add(absolute);
  });

  return {
    url: pageUrl,
    title,
    description,
    text,
    emails: [...emails.values()],
    phones: findPhones($, text),
    links: dedupeLinks(links),
    imprintLinks: [...imprintLinks],
    contactLinks: [...contactLinks],
  };
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;

/**
 * Finds addresses in running text, including the common German obfuscations
 * ("info(at)firma.de", "info [at] firma [punkt] de"). De-obfuscating is
 * legitimate here: these are addresses the company itself published for
 * contact, only written to slow down naive harvesters.
 */
export function findEmailsInText(text: string): ExtractedEmail[] {
  const found = new Map<string, ExtractedEmail>();

  const deobfuscated = text
    .replace(/\s*[\[(<{]\s*(?:at|@|ät)\s*[\])>}]\s*/gi, '@')
    .replace(/\s+(?:at|ät)\s+/gi, '@')
    .replace(/\s*[\[(<{]\s*(?:dot|punkt)\s*[\])>}]\s*/gi, '.')
    .replace(/\s+(?:dot|punkt)\s+/gi, '.');

  for (const source of [text, deobfuscated]) {
    for (const match of source.matchAll(EMAIL_RE)) {
      const address = trimTrailingPunctuation(match[0]);
      if (!isPlausibleAddress(address)) continue;
      const key = address.toLowerCase();
      if (found.has(key)) continue;
      const start = Math.max(0, (match.index ?? 0) - 90);
      found.set(key, {
        address,
        origin: 'text',
        context: normalizeWhitespace(source.slice(start, (match.index ?? 0) + address.length + 90)),
      });
    }
  }
  return [...found.values()];
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:)\]}>'"]+$/, '');
}

/** Filters out image filenames and similar false positives. */
function isPlausibleAddress(address: string): boolean {
  if (address.length > 254) return false;
  const [local, domain] = address.split('@');
  if (!local || !domain) return false;
  if (!domain.includes('.')) return false;
  const tld = domain.split('.').pop() ?? '';
  if (tld.length < 2 || tld.length > 24) return false;
  if (/\.(png|jpe?g|gif|webp|svg|css|js|woff2?)$/i.test(domain)) return false;
  // Wix/Sentry style tracking pseudo-addresses.
  if (/^(sentry|no-?reply@sentry|u\d+)$/i.test(local)) return false;
  return true;
}

const PHONE_RE = /(?:\+49|0049|0)[\s\-/()]*\d(?:[\s\-/()]*\d){5,14}/g;

function findPhones($: cheerio.CheerioAPI, text: string): string[] {
  const phones = new Set<string>();
  $('a[href^="tel:"]').each((_, element) => {
    const href = $(element).attr('href') ?? '';
    const value = decodeURIComponent(href.slice(4)).trim();
    if (value) phones.add(value);
  });
  for (const match of text.matchAll(PHONE_RE)) {
    const cleaned = match[0].replace(/\s+/g, ' ').trim();
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 16) phones.add(cleaned);
  }
  return [...phones].slice(0, 8);
}

function decodeMailto(href: string): string | null {
  const raw = href.slice('mailto:'.length).split('?')[0] ?? '';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Leave as-is; a malformed escape is still worth trying.
  }
  const address = trimTrailingPunctuation(decoded.trim());
  return isPlausibleAddress(address) ? address : null;
}

function toAbsolute(href: string, base: string): string | null {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return null;
  if (href.startsWith('javascript:')) return null;
  try {
    const url = new URL(href, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function dedupeLinks(links: ExtractedLink[]): ExtractedLink[] {
  const seen = new Set<string>();
  const result: ExtractedLink[] = [];
  for (const link of links) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    result.push(link);
    if (result.length >= 300) break;
  }
  return result;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
