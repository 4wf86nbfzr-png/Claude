/**
 * Datenbank: Migration, Dubletten, Einstufung von Adressen, Versandzentrale.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  bestEmailAddress,
  findCompanyIdByEmail,
  listEmailAddresses,
  normalizeDomain,
  upsertCompany,
  upsertEmailAddress
} from '../src/main/db/repos/companies'
import { blockedReason, addToDoNotContact, createEmailDraft, listEmails } from '../src/main/db/repos/outreach'
import { listMemory, rememberFact } from '../src/main/db/repos/system'
import { listSendCenter } from '../src/main/services/sendcenter'
import { getDb } from '../src/main/db'
import { setupTestEnvironment, teardownTestEnvironment } from './helpers'

beforeEach(() => setupTestEnvironment())
afterEach(() => teardownTestEnvironment())

describe('Migration', () => {
  it('legt alle Tabellen an', () => {
    const tables = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all<{ name: string }>()
      .map((row) => row.name)

    for (const expected of [
      'companies',
      'contacts',
      'email_addresses',
      'outreach_campaigns',
      'emails',
      'interaction_history',
      'approvals',
      'tasks',
      'sources',
      'audit_logs',
      'memory_facts',
      'do_not_contact',
      'send_log'
    ]) {
      expect(tables).toContain(expected)
    }
  })
})

describe('Firmen', () => {
  it('normalisiert Domains', () => {
    expect(normalizeDomain('https://www.Bau-Nord.de/impressum')).toBe('bau-nord.de')
    expect(normalizeDomain('bau-nord.de')).toBe('bau-nord.de')
    expect(normalizeDomain(null)).toBeNull()
  })

  it('erkennt Dubletten über die Domain, nicht über den Namen', () => {
    const first = upsertCompany({ name: 'Bau Nord GmbH', website: 'https://www.bau-nord.de/' })
    const second = upsertCompany({ name: 'Bau Nord', website: 'https://bau-nord.de/impressum' })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.company.id).toBe(first.company.id)
  })

  it('füllt Lücken auf, überschreibt aber nichts Vorhandenes', () => {
    const first = upsertCompany({ name: 'Bau Nord GmbH', website: 'https://bau-nord.de/', city: 'Hamburg' })
    upsertCompany({ name: 'Bau Nord GmbH', website: 'https://bau-nord.de/', city: 'Bremen', phone: '040 123' })

    const { company } = upsertCompany({ name: 'Bau Nord GmbH', website: 'https://bau-nord.de/' })
    expect(company.id).toBe(first.company.id)
    expect(company.city).toBe('Hamburg')
    expect(company.phone).toBe('040 123')
  })
})

describe('E-Mail-Adressen', () => {
  it('stuft eine Adresse nie herab', () => {
    const { company } = upsertCompany({ name: 'Bau Nord', website: 'https://bau-nord.de/' })

    upsertEmailAddress({
      companyId: company.id,
      address: 'info@bau-nord.de',
      status: 'VERIFIZIERT',
      statusReason: 'Impressum'
    })
    upsertEmailAddress({
      companyId: company.id,
      address: 'info@bau-nord.de',
      status: 'WAHRSCHEINLICH',
      statusReason: 'Branchenbuch'
    })

    const addresses = listEmailAddresses(company.id)
    expect(addresses).toHaveLength(1)
    expect(addresses[0].status).toBe('VERIFIZIERT')
  })

  it('gibt die belastbarste Adresse als beste zurück', () => {
    const { company } = upsertCompany({ name: 'Bau Nord', website: 'https://bau-nord.de/' })
    upsertEmailAddress({
      companyId: company.id,
      address: 'unklar@gmail.com',
      status: 'WAHRSCHEINLICH',
      statusReason: 'Freemail'
    })
    upsertEmailAddress({
      companyId: company.id,
      address: 'info@bau-nord.de',
      status: 'VERIFIZIERT',
      statusReason: 'Impressum'
    })

    expect(bestEmailAddress(company.id)?.address).toBe('info@bau-nord.de')
  })

  it('findet die Firma zu einer Adresse — Grundlage für die Zuordnung von Antworten', () => {
    const { company } = upsertCompany({ name: 'Bau Nord', website: 'https://bau-nord.de/' })
    upsertEmailAddress({
      companyId: company.id,
      address: 'info@bau-nord.de',
      status: 'VERIFIZIERT',
      statusReason: 'Impressum'
    })

    expect(findCompanyIdByEmail('INFO@bau-nord.de')).toBe(company.id)
    expect(findCompanyIdByEmail('fremd@woanders.de')).toBeNull()
  })
})

describe('Sperrliste', () => {
  it('sperrt einzelne Adressen und ganze Domains', () => {
    addToDoNotContact('nein@firma.de', 'adresse', 'Hat widersprochen.')
    addToDoNotContact('gesperrt.de', 'domain')

    expect(blockedReason('nein@firma.de')).toContain('widersprochen')
    expect(blockedReason('irgendwer@gesperrt.de')).toBeTruthy()
    expect(blockedReason('ja@firma.de')).toBeNull()
  })
})

describe('Versandzentrale', () => {
  it('zeigt Firmen ohne Entwurf und Vorgänge mit Entwurf', () => {
    const withDraft = upsertCompany({ name: 'Mit Entwurf', website: 'https://mit-entwurf.de/' })
    upsertCompany({ name: 'Ohne Entwurf', website: 'https://ohne-entwurf.de/' })

    upsertEmailAddress({
      companyId: withDraft.company.id,
      address: 'info@mit-entwurf.de',
      status: 'VERIFIZIERT',
      statusReason: 'Impressum'
    })
    createEmailDraft({
      companyId: withDraft.company.id,
      toAddress: 'info@mit-entwurf.de',
      subject: 'Angebot',
      bodyText: 'Text',
      recipientVerification: 'VERIFIZIERT'
    })

    const rows = listSendCenter()
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.company === 'Mit Entwurf')?.mailStatus).toBe('entwurf')
    expect(rows.find((row) => row.company === 'Ohne Entwurf')?.mailStatus).toBeNull()
  })

  it('filtert nach Mailstatus', () => {
    const { company } = upsertCompany({ name: 'Firma', website: 'https://firma.de/' })
    createEmailDraft({
      companyId: company.id,
      toAddress: 'info@firma.de',
      subject: 'A',
      bodyText: 'A',
      recipientVerification: 'VERIFIZIERT'
    })

    expect(listSendCenter({ status: 'entwurf' })).toHaveLength(1)
    expect(listSendCenter({ status: 'gesendet' })).toHaveLength(0)
    expect(listEmails({ status: 'entwurf' })).toHaveLength(1)
  })
})

describe('Gedächtnis', () => {
  it('überschreibt denselben Schlüssel, statt zu vervielfachen', () => {
    rememberFact({ scope: 'user_preference', key: 'tonalitaet', value: 'knapp', origin: 'Test' })
    rememberFact({ scope: 'user_preference', key: 'tonalitaet', value: 'sehr knapp', origin: 'Test' })

    const facts = listMemory('user_preference')
    expect(facts).toHaveLength(1)
    expect(facts[0].value).toBe('sehr knapp')
  })

  it('entfernt abgelaufene Notizen beim Lesen', () => {
    rememberFact({
      scope: 'system',
      key: 'temporär',
      value: 'weg',
      origin: 'Test',
      expiresAt: new Date(Date.now() - 1000).toISOString()
    })

    expect(listMemory('system')).toHaveLength(0)
  })
})
