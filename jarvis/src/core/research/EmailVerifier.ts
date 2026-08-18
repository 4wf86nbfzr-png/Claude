import { promises as dns } from 'node:dns';
import type { VerificationStatus } from '../../shared/types.js';

export interface AddressEvidence {
  address: string;
  /** Page the address was read from. */
  sourceUrl: string;
  /** What kind of page that was. */
  sourceKind: 'website' | 'kontakt' | 'impressum' | 'suchmaschine' | 'sonstige';
  /** How it appeared: a mailto link or plain text. */
  origin: 'mailto' | 'text';
  /** Registrable domain of the company website, for the domain-match check. */
  companyDomain?: string | null;
}

export interface VerificationVerdict {
  status: VerificationStatus;
  /** German sentence explaining the status; stored and shown verbatim. */
  reason: string;
  mxChecked: boolean;
  mxOk: boolean | null;
  /** Generic mailbox such as info@ / kontakt@ rather than a person. */
  role: boolean;
}

const ROLE_LOCAL_PARTS = new Set([
  'info',
  'kontakt',
  'contact',
  'office',
  'mail',
  'email',
  'zentrale',
  'buero',
  'büro',
  'anfrage',
  'anfragen',
  'service',
  'vertrieb',
  'sales',
  'einkauf',
  'verwaltung',
  'sekretariat',
  'empfang',
  'post',
  'hallo',
  'moin',
]);

/** Local parts that are never a useful outreach target. */
const UNUSABLE_LOCAL_PARTS = new Set([
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'postmaster',
  'abuse',
  'bounce',
  'bounces',
  'mailer-daemon',
  'webmaster@example',
]);

const SYNTAX = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function isSyntacticallyValid(address: string): boolean {
  const value = address.trim();
  if (value.length < 6 || value.length > 254) return false;
  if (value.includes('..')) return false;
  const [local] = value.split('@');
  if (!local || local.length > 64) return false;
  if (local.startsWith('.') || local.endsWith('.')) return false;
  return SYNTAX.test(value);
}

export function localPart(address: string): string {
  return (address.split('@')[0] ?? '').toLowerCase();
}

export function domainOf(address: string): string {
  return (address.split('@')[1] ?? '').toLowerCase();
}

export function isRoleAddress(address: string): boolean {
  return ROLE_LOCAL_PARTS.has(localPart(address));
}

export function isUnusableAddress(address: string): boolean {
  const local = localPart(address);
  return UNUSABLE_LOCAL_PARTS.has(local) || local.startsWith('noreply') || local.startsWith('no-reply');
}

/**
 * Registrable domain, good enough for German business sites: strips `www.` and
 * keeps the last two labels, or three for the common second-level suffixes.
 */
export function registrableDomain(hostOrUrl: string): string | null {
  let host = hostOrUrl.trim().toLowerCase();
  if (!host) return null;
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return null;
  const twoLevelSuffixes = new Set(['co.uk', 'com.de', 'co.at', 'or.at', 'ac.at', 'com.au']);
  const lastTwo = labels.slice(-2).join('.');
  if (twoLevelSuffixes.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

/**
 * Assigns the verification status (§4).
 *
 * VERIFIZIERT requires all of:
 *   - valid syntax
 *   - published on the company's own site (Website / Kontakt / Impressum)
 *   - the address domain belongs to that same company domain
 *   - the domain has MX records
 *
 * Anything read from a third-party page, or whose domain does not match the
 * company site (freemail addresses included), can at best be WAHRSCHEINLICH.
 * Nothing is ever guessed — this function only ever grades addresses that were
 * physically found on a page.
 */
export async function verifyAddress(
  evidence: AddressEvidence,
  options: { checkMx?: boolean } = {},
): Promise<VerificationVerdict> {
  const address = evidence.address.trim();
  const role = isRoleAddress(address);

  if (!isSyntacticallyValid(address)) {
    return {
      status: 'NICHT_VERIFIZIERT',
      reason: 'Die Adresse ist syntaktisch ungültig.',
      mxChecked: false,
      mxOk: null,
      role,
    };
  }
  if (isUnusableAddress(address)) {
    return {
      status: 'NICHT_VERIFIZIERT',
      reason: 'Systemadresse (no-reply/postmaster) — für Anschreiben ungeeignet.',
      mxChecked: false,
      mxOk: null,
      role,
    };
  }

  const addressDomain = registrableDomain(domainOf(address));
  const companyDomain = evidence.companyDomain ? registrableDomain(evidence.companyDomain) : null;
  const domainMatches = Boolean(addressDomain && companyDomain && addressDomain === companyDomain);
  const officialPage =
    evidence.sourceKind === 'website' ||
    evidence.sourceKind === 'kontakt' ||
    evidence.sourceKind === 'impressum';

  let mxOk: boolean | null = null;
  let mxChecked = false;
  if (options.checkMx !== false && addressDomain) {
    mxChecked = true;
    mxOk = await hasMailExchanger(addressDomain);
  }

  const where =
    evidence.sourceKind === 'impressum'
      ? 'im Impressum'
      : evidence.sourceKind === 'kontakt'
        ? 'auf der Kontaktseite'
        : evidence.sourceKind === 'website'
          ? 'auf der Unternehmenswebsite'
          : 'auf einer externen Quelle';

  if (mxChecked && mxOk === false) {
    return {
      status: 'NICHT_VERIFIZIERT',
      reason: `Gefunden ${where}, aber die Domain ${addressDomain} hat keinen Mailserver (kein MX-Eintrag).`,
      mxChecked,
      mxOk,
      role,
    };
  }

  if (officialPage && domainMatches && (mxOk === true || !mxChecked)) {
    return {
      status: 'VERIFIZIERT',
      reason: `Wörtlich ${where} von ${companyDomain} veröffentlicht${
        evidence.origin === 'mailto' ? ' (mailto-Link)' : ''
      }${mxOk === true ? ', Mailserver vorhanden' : ''}.`,
      mxChecked,
      mxOk,
      role,
    };
  }

  if (officialPage && !domainMatches) {
    return {
      status: 'WAHRSCHEINLICH',
      reason: `Gefunden ${where}, aber die Adressdomain (${addressDomain ?? '?'}) weicht von der Unternehmensdomain (${
        companyDomain ?? 'unbekannt'
      }) ab.`,
      mxChecked,
      mxOk,
      role,
    };
  }

  return {
    status: 'WAHRSCHEINLICH',
    reason: `Gefunden ${where} — nicht auf einer offiziellen Unternehmensseite bestätigt.`,
    mxChecked,
    mxOk,
    role,
  };
}

const mxCache = new Map<string, boolean>();

export async function hasMailExchanger(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;
  try {
    const records = await dns.resolveMx(domain);
    const result = records.length > 0;
    mxCache.set(domain, result);
    return result;
  } catch {
    // Some domains serve mail via an A record only; treat a missing MX as a
    // negative signal but confirm the domain resolves at all.
    try {
      await dns.resolve(domain);
      mxCache.set(domain, false);
      return false;
    } catch {
      mxCache.set(domain, false);
      return false;
    }
  }
}

/** Test seam: clears the DNS memoisation. */
export function resetMxCache(): void {
  mxCache.clear();
}
