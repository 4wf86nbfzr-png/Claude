/**
 * Auswertung einer abgerufenen Seite.
 *
 * Hier wird nichts erfunden: Es wird nur zurückgegeben, was wörtlich auf der
 * Seite steht. Ergänzt wird lediglich das Auflösen der üblichen
 * Verschleierungen ("name (at) firma (punkt) de"), weil das dieselbe Angabe
 * ist, nur anders geschrieben.
 */
import * as cheerio from 'cheerio'

export interface ExtractedPerson {
  name: string
  position: string | null
  /** Der Textabschnitt, in dem die Angabe stand. */
  context: string
}

export interface ExtractedPage {
  title: string | null
  metaDescription: string | null
  text: string
  emails: string[]
  phones: string[]
  imprintUrl: string | null
  contactUrl: string | null
  privacyUrl: string | null
  postalCode: string | null
  city: string | null
  street: string | null
  persons: ExtractedPerson[]
  links: { href: string; text: string }[]
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi
const PHONE_RE = /(?:\+49|0049|0)[\s\-/().]?\d(?:[\d\s\-/().]{6,18})\d/g
const ZIP_CITY_RE = /\b(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]+(?:[ -][A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]+){0,3})/
const STREET_RE = /\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]*(?:str(?:aße|asse)\.?|weg|allee|platz|damm|ring|gasse|chaussee|ufer)\b[^,\n]{0,12}\d{1,4}\s?[a-zA-Z]?)/

const ROLE_WORDS = [
  'Geschäftsführer',
  'Geschäftsführerin',
  'Geschäftsführung',
  'Inhaber',
  'Inhaberin',
  'Vorstand',
  'Prokurist',
  'Prokuristin',
  'Betriebsleiter',
  'Betriebsleiterin',
  'Bauleiter',
  'Bauleiterin',
  'Niederlassungsleiter',
  'Projektleiter',
  'Projektleiterin',
  'Ansprechpartner',
  'Ansprechpartnerin',
  'Einkaufsleiter',
  'Leiter Einkauf',
  'Leitung',
  'Vertretungsberechtigt'
]

/** Nicht-Adressen, die der Regex sonst einsammelt. */
const EMAIL_NOISE = /(\.(png|jpe?g|gif|svg|webp|css|js)$)|(@(2x|3x)\.)|(sentry\.io$)|(example\.(com|org|de)$)|(wixpress\.com$)|(@sentry)/i

/** Löst gängige Verschleierungen auf, damit echte Adressen nicht verloren gehen. */
export function deobfuscate(input: string): string {
  return input
    .replace(/&#0?64;/gi, '@')
    .replace(/&#0?46;/gi, '.')
    .replace(/\s*[([{<]\s*(at|ät|aet)\s*[)\]}>]\s*/gi, '@')
    .replace(/\s+(at|ät)\s+/gi, '@')
    .replace(/\s*[([{<]\s*(dot|punkt)\s*[)\]}>]\s*/gi, '.')
    .replace(/\s+(dot|punkt)\s+/gi, '.')
}

function absolute(base: string, href: string | undefined): string | null {
  if (!href) return null
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

function uniq(values: string[]): string[] {
  return [...new Set(values)]
}

/** Wörter, die zwar groß geschrieben sind, aber keine Namen sind. */
const NOT_A_NAME = new Set([
  'Kontakt',
  'Datenschutz',
  'Impressum',
  'Startseite',
  'Telefon',
  'Telefax',
  'Mobil',
  'Adresse',
  'Anschrift',
  'Sitz',
  'Registergericht',
  'Amtsgericht',
  'Handelsregister',
  'Steuernummer',
  'Umsatzsteuer',
  'Postfach',
  'Hamburg',
  'Berlin',
  'München',
  'Deutschland',
  'GmbH',
  'AG',
  'KG',
  'Home',
  'Aktuelles',
  'Leistungen',
  'Referenzen',
  'Karriere',
  'Jobs',
  'Unternehmen'
])

const NAME_RE =
  /\b((?:Dipl\.-Ing\.\s|Dr\.\s|Prof\.\s)?[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?\s(?:von\s|van\s|de\s)?[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?)\b/g

/**
 * Sucht in einem Textstück nach einem Personennamen.
 * Rollenbezeichnungen werden vorher entfernt — sie sind selbst groß
 * geschrieben und würden sonst als Vorname durchgehen.
 */
function findNameIn(fragment: string): string | null {
  let cleaned = fragment
  for (const word of ROLE_WORDS) cleaned = cleaned.split(word).join(' ')

  NAME_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = NAME_RE.exec(cleaned)) !== null) {
    const name = match[1].trim()
    const parts = name.split(/\s+/)
    if (parts.length < 2) continue
    if (parts.some((part) => NOT_A_NAME.has(part.replace(/[.,;:]/g, '')))) continue
    return name
  }
  return null
}

function findPersons(text: string): ExtractedPerson[] {
  const persons: ExtractedPerson[] = []
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const role = ROLE_WORDS.find((word) => line.includes(word))
    if (!role) continue

    // Erst dieselbe Zeile — steht der Name dort nicht, die nächste.
    const name = findNameIn(line) ?? findNameIn(lines[i + 1] ?? '')
    if (!name) continue
    if (persons.some((p) => p.name === name)) continue

    persons.push({ name, position: role, context: line.slice(0, 240) })
  }

  return persons.slice(0, 12)
}

export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const $ = cheerio.load(html)
  $('script, style, noscript, svg').remove()

  // Ohne diese Umbrüche klebt der Text aus benachbarten Elementen zusammen —
  // aus "Hafenstraße 12" plus "20359 Hamburg" würde sonst "1220359".
  $('br').replaceWith('\n')
  $('p, div, li, tr, td, th, h1, h2, h3, h4, h5, h6, section, article, address, header, footer, nav, dt, dd').append(
    '\n'
  )

  const text = deobfuscate(
    $('body')
      .text()
      .replace(/ /g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim()
  )

  // Adressen aus mailto-Links sind die verlässlichsten.
  const mailtoAddresses: string[] = []
  const links: { href: string; text: string }[] = []
  let imprintUrl: string | null = null
  let contactUrl: string | null = null
  let privacyUrl: string | null = null

  $('a[href]').each((_, element) => {
    const rawHref = $(element).attr('href') ?? ''
    const label = $(element).text().replace(/\s+/g, ' ').trim()

    if (rawHref.toLowerCase().startsWith('mailto:')) {
      const address = decodeURIComponent(rawHref.slice(7).split('?')[0]).trim().toLowerCase()
      if (address) mailtoAddresses.push(address)
      return
    }

    const href = absolute(baseUrl, rawHref)
    if (!href) return
    links.push({ href, text: label })

    const probe = `${label} ${href}`.toLowerCase()
    if (!imprintUrl && /(impressum|imprint|legal-notice)/.test(probe)) imprintUrl = href
    if (!contactUrl && /(kontakt|contact|ansprechpartner)/.test(probe)) contactUrl = href
    if (!privacyUrl && /(datenschutz|privacy)/.test(probe)) privacyUrl = href
  })

  const textEmails = (text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase())
  const emails = uniq([...mailtoAddresses, ...textEmails])
    .map((e) => e.replace(/[.,;:]+$/, ''))
    .filter((e) => !EMAIL_NOISE.test(e))
    .filter((e) => e.length <= 254)

  const phones = uniq(
    (text.match(PHONE_RE) ?? [])
      .map((p) => p.replace(/[\s\-/().]+/g, ' ').trim())
      .filter((p) => p.replace(/\D/g, '').length >= 8 && p.replace(/\D/g, '').length <= 16)
  ).slice(0, 6)

  const zipMatch = ZIP_CITY_RE.exec(text)
  const streetMatch = STREET_RE.exec(text)

  return {
    title: $('title').first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr('content')?.trim() ?? null,
    text: text.slice(0, 60_000),
    emails,
    phones,
    imprintUrl,
    contactUrl,
    privacyUrl,
    postalCode: zipMatch?.[1] ?? null,
    city: zipMatch?.[2]?.trim() ?? null,
    street: streetMatch?.[1]?.trim() ?? null,
    persons: findPersons(text),
    links: links.slice(0, 400)
  }
}
