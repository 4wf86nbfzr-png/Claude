/**
 * Recherche: Auslesen von Seiten und Einstufen von Adressen.
 *
 * Hier wird auch der Grundsatz geprüft, dass nichts erfunden wird — der
 * Extraktor gibt nur zurück, was im HTML steht.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deobfuscate, extractPage } from '../src/main/research/extract'
import { classifyEmail, domainMatches, isSyntacticallyValid } from '../src/main/research/verify'
import { candidatesFromHits, companyNameFromTitle } from '../src/main/agents/research-agent'
import { setupTestEnvironment, teardownTestEnvironment } from './helpers'

beforeEach(() => setupTestEnvironment())
afterEach(() => teardownTestEnvironment())

const IMPRESSUM_HTML = `
<!doctype html>
<html lang="de"><head>
  <title>Impressum – Bau Nord GmbH</title>
  <meta name="description" content="Hochbau und Projektentwicklung in Hamburg." />
</head>
<body>
  <h1>Impressum</h1>
  <p>Bau Nord GmbH<br>Hafenstraße 12<br>20359 Hamburg</p>
  <p>Telefon: +49 40 123456-0</p>
  <p>E-Mail: <a href="mailto:info@bau-nord.de">info@bau-nord.de</a></p>
  <p>Vertretungsberechtigt: Geschäftsführer Klaus Petersen</p>
  <p>Bauleiter Anna Meier erreichen Sie unter bauleitung (at) bau-nord (punkt) de</p>
  <nav><a href="/kontakt">Kontakt</a> <a href="/datenschutz">Datenschutz</a></nav>
</body></html>`

describe('Seiten auslesen', () => {
  const page = extractPage(IMPRESSUM_HTML, 'https://bau-nord.de/impressum')

  it('nimmt Titel und Beschreibung wörtlich', () => {
    expect(page.title).toBe('Impressum – Bau Nord GmbH')
    expect(page.metaDescription).toContain('Hochbau')
  })

  it('findet Adressen aus mailto-Links und aus dem Text', () => {
    expect(page.emails).toContain('info@bau-nord.de')
    expect(page.emails).toContain('bauleitung@bau-nord.de')
  })

  it('löst die üblichen Verschleierungen auf', () => {
    expect(deobfuscate('post (at) firma (punkt) de')).toBe('post@firma.de')
    expect(deobfuscate('post [at] firma [dot] de')).toBe('post@firma.de')
  })

  it('findet Anschrift und Telefonnummer', () => {
    expect(page.postalCode).toBe('20359')
    expect(page.city).toBe('Hamburg')
    expect(page.street).toContain('Hafenstraße 12')
    expect(page.phones.length).toBeGreaterThan(0)
  })

  it('findet öffentlich genannte Ansprechpartner mit Position', () => {
    const names = page.persons.map((person) => person.name)
    expect(names).toContain('Klaus Petersen')
  })

  it('erkennt Kontakt- und Datenschutzseite', () => {
    expect(page.contactUrl).toBe('https://bau-nord.de/kontakt')
    expect(page.privacyUrl).toBe('https://bau-nord.de/datenschutz')
  })

  it('erfindet nichts: ohne Angabe im HTML kommt nichts zurück', () => {
    const leer = extractPage('<html><body><h1>Nur eine Ueberschrift</h1></body></html>', 'https://leer.de/')
    expect(leer.emails).toHaveLength(0)
    expect(leer.persons).toHaveLength(0)
    expect(leer.city).toBeNull()
  })
})

describe('Adressen einstufen', () => {
  it('erkennt gültige und ungültige Schreibweisen', () => {
    expect(isSyntacticallyValid('info@bau-nord.de')).toBe(true)
    expect(isSyntacticallyValid('info@bau nord.de')).toBe(false)
    expect(isSyntacticallyValid('info@@bau-nord.de')).toBe(false)
  })

  it('erkennt passende Domains, auch als Unterdomain', () => {
    expect(domainMatches('info@bau-nord.de', 'bau-nord.de')).toBe(true)
    expect(domainMatches('info@mail.bau-nord.de', 'bau-nord.de')).toBe(true)
    expect(domainMatches('info@andere-firma.de', 'bau-nord.de')).toBe(false)
  })

  it('stuft eine Impressumsadresse der eigenen Domain als VERIFIZIERT ein', async () => {
    const outcome = await classifyEmail({
      address: 'info@bau-nord.de',
      origin: 'impressum',
      companyDomain: 'bau-nord.de',
      sourceUrl: 'https://bau-nord.de/impressum',
      skipMx: true
    })
    expect(outcome.status).toBe('VERIFIZIERT')
    expect(outcome.reason).toContain('Impressum')
  })

  it('stuft eine Freemail-Adresse auf der eigenen Seite nur als WAHRSCHEINLICH ein', async () => {
    const outcome = await classifyEmail({
      address: 'bau.nord@gmail.com',
      origin: 'impressum',
      companyDomain: 'bau-nord.de',
      sourceUrl: 'https://bau-nord.de/impressum',
      skipMx: true
    })
    expect(outcome.status).toBe('WAHRSCHEINLICH')
  })

  it('stuft eine Adresse aus einer Fremdquelle nur als WAHRSCHEINLICH ein', async () => {
    const outcome = await classifyEmail({
      address: 'info@bau-nord.de',
      origin: 'fremdquelle',
      companyDomain: 'bau-nord.de',
      sourceUrl: 'https://irgendein-branchenbuch.de/eintrag',
      skipMx: true
    })
    expect(outcome.status).toBe('WAHRSCHEINLICH')
  })

  it('lehnt Postfächer ab, die keine Nachrichten annehmen', async () => {
    const outcome = await classifyEmail({
      address: 'no-reply@bau-nord.de',
      origin: 'impressum',
      companyDomain: 'bau-nord.de',
      sourceUrl: 'https://bau-nord.de/impressum',
      skipMx: true
    })
    expect(outcome.status).toBe('NICHT_VERIFIZIERT')
  })

  it('lehnt kaputte Schreibweisen ab', async () => {
    const outcome = await classifyEmail({
      address: 'nicht wirklich eine adresse',
      origin: 'impressum',
      companyDomain: 'bau-nord.de',
      sourceUrl: 'https://bau-nord.de/impressum',
      skipMx: true
    })
    expect(outcome.status).toBe('NICHT_VERIFIZIERT')
  })
})

describe('Suchtreffer bereinigen', () => {
  it('wirft Verzeichnisportale raus und fasst je Domain zusammen', () => {
    const candidates = candidatesFromHits([
      { title: 'Bau Nord GmbH', url: 'https://bau-nord.de/', snippet: '' },
      { title: 'Bau Nord – Impressum', url: 'https://www.bau-nord.de/impressum', snippet: '' },
      { title: 'Bau Nord bei Gelbe Seiten', url: 'https://www.gelbeseiten.de/xy', snippet: '' },
      { title: 'Bau Nord auf LinkedIn', url: 'https://de.linkedin.com/company/bau-nord', snippet: '' },
      { title: 'Hoch Sued AG', url: 'https://hoch-sued.de/', snippet: '' }
    ])

    expect(candidates.map((c) => c.domain)).toEqual(['bau-nord.de', 'hoch-sued.de'])
  })

  it('zieht den Firmennamen aus dem Seitentitel', () => {
    expect(companyNameFromTitle('Bau Nord GmbH | Hochbau in Hamburg', 'bau-nord.de')).toBe('Bau Nord GmbH')
    expect(companyNameFromTitle('Startseite – Hoch Sued AG', 'hoch-sued.de')).toBe('Hoch Sued AG')
    expect(companyNameFromTitle(null, 'bau-nord.de')).toBe('bau-nord.de')
  })
})
