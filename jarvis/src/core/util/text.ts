/** Textnormalisierung für Dublettenerkennung und Domainvergleiche. */

const RECHTSFORMEN = [
  'gesellschaft mit beschraenkter haftung',
  'gmbh & co. kg',
  'gmbh & co kg',
  'gmbh',
  'mbh',
  'ag & co. kg',
  ' ag',
  ' kg',
  ' ohg',
  ' gbr',
  ' ug',
  'haftungsbeschraenkt',
  'e.k.',
  ' ek',
  ' e.v.',
  ' se',
  ' kgaa'
];

/** ä→ae, ö→oe, ü→ue, ß→ss und Entfernen sonstiger Diakritika. */
export function foldUmlauts(input: string): string {
  return input
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Vergleichsform eines Firmennamens.
 * "Müller Bau GmbH & Co. KG" und "Mueller Bau GmbH" ergeben beide "mueller bau".
 */
export function normalizeCompanyName(name: string): string {
  // Kleinschreiben und in Leerzeichen einfassen, damit die Rechtsform-Muster
  // mit führendem Leerzeichen auch am Wortanfang greifen.
  let value = ` ${foldUmlauts(name).toLowerCase()} `;
  for (const form of RECHTSFORMEN) {
    value = value.split(form).join(' ');
  }
  return value
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Hostname ohne "www." und ohne Protokoll; null bei unbrauchbarer Eingabe. */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const host = new URL(withScheme).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Registrierbare Domain (grobe Heuristik für zusammengesetzte Endungen). */
export function registrableDomain(host: string | null): string | null {
  if (!host) return null;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const zusammengesetzt = ['co.uk', 'com.de', 'co.at', 'com.br', 'co.jp'];
  const letzteZwei = parts.slice(-2).join('.');
  if (zusammengesetzt.includes(letzteZwei)) return parts.slice(-3).join('.');
  return letzteZwei;
}

export function normalizeEmail(address: string): string {
  return address.trim().toLowerCase();
}

const EMAIL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

export function isValidEmailSyntax(address: string): boolean {
  const value = normalizeEmail(address);
  return value.length <= 254 && EMAIL_RE.test(value);
}

export function emailDomain(address: string): string | null {
  const at = normalizeEmail(address).lastIndexOf('@');
  return at === -1 ? null : normalizeEmail(address).slice(at + 1) || null;
}

const FUNKTIONSPOSTFAECHER = [
  'info',
  'kontakt',
  'office',
  'mail',
  'buero',
  'verwaltung',
  'zentrale',
  'anfrage',
  'service',
  'sekretariat',
  'einkauf',
  'vergabe'
];

/** Sammelpostfach (info@…) statt persönlicher Adresse. */
export function isRoleAddress(address: string): boolean {
  const local = normalizeEmail(address).split('@')[0] ?? '';
  return FUNKTIONSPOSTFAECHER.includes(local.replace(/[^a-z]/g, ''));
}

/** Kürzt Text für Protokolle und Belegausschnitte. */
export function truncate(value: string, max = 280): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
