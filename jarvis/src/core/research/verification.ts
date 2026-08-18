import { promises as dns } from 'node:dns';
import { VerificationStatus } from '../../shared/status';
import { emailDomain, isValidEmailSyntax, normalizeDomain, normalizeEmail, registrableDomain } from '../util/text';

export type Fundart = 'mailto' | 'klartext' | 'entschluesselt' | 'suchtreffer' | 'vermutung';
export type Seitenart = 'impressum' | 'kontakt' | 'website' | 'verzeichnis' | 'unbekannt';

export interface Pruefeingabe {
  address: string;
  /** Seite, auf der die Adresse wörtlich stand. */
  evidenceUrl: string | null;
  /** Offizielle Domain des Unternehmens, falls bekannt. */
  companyDomain: string | null;
  fundart: Fundart;
  seitenart: Seitenart;
  /** Ergebnis der MX-Prüfung, falls bereits durchgeführt. */
  mxVorhanden?: boolean;
}

export interface Pruefergebnis {
  status: VerificationStatus;
  method: string;
  begruendung: string;
}

const FREEMAILER = new Set([
  'gmail.com',
  'googlemail.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  't-online.de',
  'outlook.com',
  'outlook.de',
  'hotmail.com',
  'yahoo.de',
  'yahoo.com',
  'freenet.de',
  'aol.com',
  'icloud.com',
  'mail.de',
  'posteo.de'
]);

/**
 * Bewertet, wie belastbar eine gefundene E-Mail-Adresse ist (§4).
 *
 * Der wichtigste Fall steht ganz oben: Eine nur aus einem Namensschema
 * abgeleitete Adresse ("vorname.nachname@firma.de") ist niemals verifiziert.
 * Sie darf nicht angeschrieben werden, egal wie plausibel sie aussieht.
 */
export function bewerteAdresse(eingabe: Pruefeingabe): Pruefergebnis {
  const address = normalizeEmail(eingabe.address);

  if (!isValidEmailSyntax(address)) {
    return {
      status: VerificationStatus.NICHT_VERIFIZIERT,
      method: 'syntaxpruefung',
      begruendung: 'Die Zeichenfolge ist keine gültige E-Mail-Adresse.'
    };
  }

  if (eingabe.fundart === 'vermutung') {
    return {
      status: VerificationStatus.NICHT_VERIFIZIERT,
      method: 'vermutung',
      begruendung:
        'Adresse wurde nur aus einem Namensschema abgeleitet und stand nirgends belegt. Wird nicht für den Versand verwendet.'
    };
  }

  if (!eingabe.evidenceUrl) {
    return {
      status: VerificationStatus.NICHT_VERIFIZIERT,
      method: eingabe.fundart,
      begruendung: 'Keine Quelle angegeben, auf der die Adresse wörtlich steht.'
    };
  }

  if (eingabe.mxVorhanden === false) {
    return {
      status: VerificationStatus.NICHT_VERIFIZIERT,
      method: 'mx-pruefung',
      begruendung: 'Die Domain nimmt laut DNS keine E-Mails an – ein Versand würde scheitern.'
    };
  }

  const belegHost = normalizeDomain(eingabe.evidenceUrl);
  const firmenDomain = eingabe.companyDomain ? normalizeDomain(eingabe.companyDomain) : null;
  const adressDomain = emailDomain(address);
  const belegAufFirmenseite =
    Boolean(belegHost && firmenDomain) &&
    registrableDomain(belegHost) === registrableDomain(firmenDomain);
  const adresseZurFirma =
    Boolean(adressDomain && firmenDomain) &&
    registrableDomain(adressDomain) === registrableDomain(firmenDomain);
  const istFreemailer = Boolean(adressDomain && FREEMAILER.has(adressDomain));

  if (belegAufFirmenseite && ['impressum', 'kontakt', 'website'].includes(eingabe.seitenart)) {
    if (adresseZurFirma || istFreemailer) {
      return {
        status: VerificationStatus.VERIFIZIERT,
        method: `${eingabe.seitenart}/${eingabe.fundart}`,
        begruendung: `Adresse steht wörtlich auf der Seite ${eingabe.evidenceUrl} des Unternehmens.`
      };
    }
    // Fremde Domain im Fußbereich: oft die Agentur oder der Datenschutzbeauftragte.
    return {
      status: VerificationStatus.WAHRSCHEINLICH,
      method: `${eingabe.seitenart}/fremde-domain`,
      begruendung:
        `Adresse steht auf der Unternehmensseite, gehört aber zur Domain ${adressDomain}. ` +
        'Vor dem Versand prüfen, ob sie wirklich zum Unternehmen gehört.'
    };
  }

  if (adresseZurFirma) {
    return {
      status: VerificationStatus.WAHRSCHEINLICH,
      method: `${eingabe.seitenart}/passende-domain`,
      begruendung: `Adresse stammt aus einer externen Quelle (${eingabe.evidenceUrl}), passt aber zur Firmendomain.`
    };
  }

  return {
    status: VerificationStatus.WAHRSCHEINLICH,
    method: `${eingabe.seitenart}/externe-quelle`,
    begruendung: `Adresse stand auf ${eingabe.evidenceUrl}, ließ sich aber keiner offiziellen Unternehmensseite zuordnen.`
  };
}

export interface MxErgebnis {
  ok: boolean;
  hosts: string[];
  error?: string;
}

/**
 * Prüft, ob die Domain überhaupt Mails annehmen kann.
 * Es wird ausschließlich das DNS befragt – kein Zustellversuch, keine
 * Kontaktaufnahme mit dem Empfänger.
 */
export async function pruefeMx(
  domainOderAdresse: string,
  resolver: { resolveMx: typeof dns.resolveMx; resolve4: typeof dns.resolve4 } = dns
): Promise<MxErgebnis> {
  const domain = domainOderAdresse.includes('@') ? emailDomain(domainOderAdresse) : domainOderAdresse;
  if (!domain) return { ok: false, hosts: [], error: 'Keine Domain erkennbar.' };
  try {
    const eintraege = await resolver.resolveMx(domain);
    if (eintraege.length > 0) {
      return {
        ok: true,
        hosts: eintraege.sort((a, b) => a.priority - b.priority).map((e) => e.exchange)
      };
    }
  } catch {
    // Kein MX-Eintrag – nach RFC 5321 darf ersatzweise der A-Eintrag gelten.
  }
  try {
    const adressen = await resolver.resolve4(domain);
    if (adressen.length > 0) return { ok: true, hosts: adressen };
  } catch (error) {
    return { ok: false, hosts: [], error: (error as Error).message };
  }
  return { ok: false, hosts: [], error: 'Weder MX- noch A-Eintrag gefunden.' };
}

/** Nur diese Adressen dürfen ohne Sonderfreigabe angeschrieben werden (§4). */
export function darfAngeschriebenWerden(status: VerificationStatus): boolean {
  return status === VerificationStatus.VERIFIZIERT;
}
