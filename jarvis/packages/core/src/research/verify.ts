import { promises as dns } from 'node:dns';
import type { VerificationStatus } from '../db/schema.js';
import { domainOfEmail, registrableDomain } from '../util/text.js';

/**
 * Der Verifizierungsstatus einer Adresse.
 *
 * Die Regel ist bewusst eng: verifiziert ist nur, was woertlich auf einer
 * Seite der Firma selbst steht. Ein Muster wie vorname.nachname@firma.de
 * entsteht hier nie -- es gibt keinen Codepfad, der eine Adresse erzeugt.
 */

export interface VerificationInput {
  address: string;
  /** URL der Seite, auf der die Adresse woertlich stand. */
  foundOnUrl: string | null;
  /** Offizielle Website der Firma, falls bekannt. */
  companyWebsite: string | null;
  /** Art der Quelle. */
  sourceKind: 'website' | 'impressum' | 'kontakt' | 'suchtreffer' | 'drittquelle' | 'manuell';
  /** Ergebnis der MX-Pruefung; null wenn nicht durchgefuehrt/nicht moeglich. */
  mxOk: boolean | null;
}

export interface VerificationResult {
  status: VerificationStatus;
  note: string;
}

export function classifyAddress(input: VerificationInput): VerificationResult {
  if (!isSyntacticallyValid(input.address)) {
    return { status: 'NICHT_VERIFIZIERT', note: 'Die Adresse ist syntaktisch nicht gültig.' };
  }
  if (!input.foundOnUrl) {
    return {
      status: 'NICHT_VERIFIZIERT',
      note: 'Die Adresse wurde nicht auf einer abgerufenen Seite belegt.',
    };
  }

  const pageDomain = safeDomain(input.foundOnUrl);
  const siteDomain = input.companyWebsite ? safeDomain(input.companyWebsite) : null;
  const onOwnSite = Boolean(pageDomain && siteDomain && pageDomain === siteDomain);

  if (input.mxOk === false) {
    return {
      status: 'WAHRSCHEINLICH',
      note: `Für ${domainOfEmail(input.address) ?? 'die Domain'} ist kein Mailserver erreichbar — Zustellung ist unsicher.`,
    };
  }

  if (onOwnSite && (input.sourceKind === 'impressum' || input.sourceKind === 'kontakt')) {
    return {
      status: 'VERIFIZIERT',
      note: `Wörtlich auf ${input.sourceKind === 'impressum' ? 'der Impressumsseite' : 'der Kontaktseite'} der Firma gefunden (${input.foundOnUrl}).`,
    };
  }
  if (onOwnSite) {
    return {
      status: 'VERIFIZIERT',
      note: `Wörtlich auf der Unternehmenswebsite gefunden (${input.foundOnUrl}).`,
    };
  }
  if (input.sourceKind === 'manuell') {
    return { status: 'WAHRSCHEINLICH', note: 'Manuell eingetragen — Herkunft bitte selbst prüfen.' };
  }
  return {
    status: 'WAHRSCHEINLICH',
    note: `Auf einer fremden Seite gefunden (${input.foundOnUrl}), nicht auf der Unternehmenswebsite selbst.`,
  };
}

export function isSyntacticallyValid(address: string): boolean {
  const a = address.trim();
  if (a.length < 6 || a.length > 254) return false;
  if (!/^[^\s@<>",;]+@[^\s@<>",;]+$/.test(a)) return false;
  const domain = a.slice(a.lastIndexOf('@') + 1);
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) return false;
  if (!/\.[a-z]{2,}$/i.test(domain)) return false;
  return true;
}

/**
 * Prueft, ob die Domain ueberhaupt Mail annehmen kann.
 * Das ist eine reine DNS-Abfrage -- es wird kein Postfach angesprochen und
 * keine Verbindung zum Mailserver aufgebaut.
 */
export async function checkMx(address: string, timeoutMs = 5000): Promise<boolean | null> {
  const domain = address.slice(address.lastIndexOf('@') + 1).toLowerCase();
  if (!domain) return null;

  const withTimeout = <T>(p: Promise<T>): Promise<T | null> =>
    Promise.race([
      p.catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx && mx.length > 0) return true;

    // Kein MX-Eintrag: laut RFC 5321 darf dann der A/AAAA-Eintrag genutzt werden.
    const a = await withTimeout(dns.resolve4(domain));
    if (a && a.length > 0) return true;
    const aaaa = await withTimeout(dns.resolve6(domain));
    if (aaaa && aaaa.length > 0) return true;

    return false;
  } catch {
    // Netzwerkfehler heisst nicht "ungueltig" -- lieber keine Aussage treffen.
    return null;
  }
}

/** Funktions- oder Personenadresse? Beeinflusst die Anrede in der Mail. */
export function addressKind(address: string): 'funktion' | 'person' {
  const local = address.slice(0, address.indexOf('@')).toLowerCase();
  const funktionen = [
    'info', 'kontakt', 'contact', 'office', 'buero', 'bureau', 'mail', 'email',
    'zentrale', 'empfang', 'service', 'anfrage', 'anfragen', 'vertrieb', 'sales',
    'einkauf', 'bewerbung', 'jobs', 'presse', 'support', 'hallo', 'moin', 'team',
  ];
  if (funktionen.some((f) => local === f || local.startsWith(`${f}.`) || local.startsWith(`${f}-`))) {
    return 'funktion';
  }
  // vorname.nachname / v.nachname deutet auf eine Person hin.
  return /^[a-zäöüß]+[._-][a-zäöüß]+$/i.test(local) ? 'person' : 'funktion';
}

function safeDomain(url: string): string | null {
  try {
    return registrableDomain(new URL(url).hostname);
  } catch {
    return null;
  }
}
