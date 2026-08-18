/**
 * Einstufung von E-Mail-Adressen.
 *
 * Eine Adresse wird nur dann als VERIFIZIERT geführt, wenn sie wörtlich auf
 * einer Seite des Unternehmens stand und die Domain dazu passt. Adressen
 * werden nie konstruiert — "vorname.nachname@firma.de" ist eine Vermutung,
 * keine Angabe, und taucht deshalb hier gar nicht erst auf.
 */
import { resolveMx } from 'node:dns/promises'
import type { VerificationStatus } from '@shared/types'

/** Wo eine Adresse gefunden wurde. Die Reihenfolge entspricht der Priorität. */
export type FindingOrigin =
  | 'impressum'
  | 'kontaktseite'
  | 'unternehmenswebsite'
  | 'fremdquelle'
  | 'nutzereingabe'

export const ORIGIN_LABEL: Record<FindingOrigin, string> = {
  impressum: 'Impressum',
  kontaktseite: 'Kontaktseite',
  unternehmenswebsite: 'Unternehmenswebsite',
  fremdquelle: 'andere öffentliche Quelle',
  nutzereingabe: 'vom Nutzer angegeben'
}

const SYNTAX_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

/** Adressen, die nirgends hinführen oder offensichtlich Beispiele sind. */
const UNUSABLE = /^(no-?reply|do-?not-?reply|postmaster|abuse|webmaster@example)/i
const FREEMAIL = /^(gmail|googlemail|web|gmx|t-online|outlook|hotmail|yahoo|icloud|freenet|aol)\./i

export function isSyntacticallyValid(address: string): boolean {
  const value = address.trim()
  return value.length <= 254 && SYNTAX_RE.test(value)
}

export function emailDomain(address: string): string {
  return address.trim().toLowerCase().split('@')[1] ?? ''
}

/** Gehört die Mail-Domain zur Website-Domain (auch als Unterdomain)? */
export function domainMatches(emailAddress: string, companyDomain: string | null): boolean {
  if (!companyDomain) return false
  const mailDomain = emailDomain(emailAddress)
  const site = companyDomain.toLowerCase().replace(/^www\./, '')
  if (!mailDomain || !site) return false
  return mailDomain === site || mailDomain.endsWith(`.${site}`) || site.endsWith(`.${mailDomain}`)
}

const mxCache = new Map<string, boolean>()

export async function hasMxRecord(domain: string): Promise<boolean> {
  const key = domain.toLowerCase()
  const cached = mxCache.get(key)
  if (cached !== undefined) return cached
  try {
    const records = await resolveMx(key)
    const ok = records.length > 0 && records.some((r) => r.exchange)
    mxCache.set(key, ok)
    return ok
  } catch {
    mxCache.set(key, false)
    return false
  }
}

export interface VerificationInput {
  address: string
  origin: FindingOrigin
  /** Domain der Unternehmenswebsite, ohne www. */
  companyDomain: string | null
  /** URL der Seite, auf der die Adresse stand. */
  sourceUrl: string
  /** MX-Prüfung überspringen (Tests, Offline-Betrieb). */
  skipMx?: boolean
}

export interface VerificationOutcome {
  address: string
  status: VerificationStatus
  reason: string
  mxChecked: boolean
  mxOk: boolean | null
}

/**
 * Stuft eine gefundene Adresse ein.
 *
 * Die Begründung wird mitgeliefert und später in der Versandzentrale
 * angezeigt — der Nutzer soll sehen können, warum JARVIS eine Adresse für
 * belastbar hält.
 */
export async function classifyEmail(input: VerificationInput): Promise<VerificationOutcome> {
  const address = input.address.trim().toLowerCase()

  if (!isSyntacticallyValid(address)) {
    return {
      address,
      status: 'NICHT_VERIFIZIERT',
      reason: 'Die Adresse ist syntaktisch nicht gültig.',
      mxChecked: false,
      mxOk: null
    }
  }

  if (UNUSABLE.test(address)) {
    return {
      address,
      status: 'NICHT_VERIFIZIERT',
      reason: 'Postfach nimmt keine Nachrichten entgegen (no-reply/postmaster/abuse).',
      mxChecked: false,
      mxOk: null
    }
  }

  const domain = emailDomain(address)
  let mxOk: boolean | null = null
  if (!input.skipMx) mxOk = await hasMxRecord(domain)

  if (mxOk === false) {
    return {
      address,
      status: 'NICHT_VERIFIZIERT',
      reason: `Die Domain ${domain} hat keinen MX-Eintrag — dorthin lässt sich keine Mail zustellen.`,
      mxChecked: true,
      mxOk: false
    }
  }

  const onOwnSite = input.origin === 'impressum' || input.origin === 'kontaktseite' || input.origin === 'unternehmenswebsite'
  const matches = domainMatches(address, input.companyDomain)
  const originLabel = ORIGIN_LABEL[input.origin]

  if (onOwnSite && matches) {
    return {
      address,
      status: 'VERIFIZIERT',
      reason: `Wörtlich auf der eigenen Seite gefunden (${originLabel}: ${input.sourceUrl}); Domain passt zur Website; MX vorhanden.`,
      mxChecked: !input.skipMx,
      mxOk
    }
  }

  if (onOwnSite && FREEMAIL.test(`${domain}.`)) {
    return {
      address,
      status: 'WAHRSCHEINLICH',
      reason: `Auf der eigenen Seite gefunden (${originLabel}), aber ein Freemail-Postfach (${domain}) — nicht die Firmendomain.`,
      mxChecked: !input.skipMx,
      mxOk
    }
  }

  if (onOwnSite) {
    return {
      address,
      status: 'WAHRSCHEINLICH',
      reason: `Auf der eigenen Seite gefunden (${originLabel}), aber die Mail-Domain ${domain} weicht von der Website ab.`,
      mxChecked: !input.skipMx,
      mxOk
    }
  }

  if (input.origin === 'nutzereingabe') {
    return {
      address,
      status: 'WAHRSCHEINLICH',
      reason: 'Vom Nutzer eingegeben — nicht auf einer Unternehmensseite geprüft.',
      mxChecked: !input.skipMx,
      mxOk
    }
  }

  return {
    address,
    status: 'WAHRSCHEINLICH',
    reason: `Aus einer fremden Quelle übernommen (${input.sourceUrl}) — nicht auf der Unternehmensseite bestätigt.`,
    mxChecked: !input.skipMx,
    mxOk
  }
}

/** Nur für Tests. */
export function resetMxCache(): void {
  mxCache.clear()
}
