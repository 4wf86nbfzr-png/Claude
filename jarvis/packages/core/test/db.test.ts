import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb, type TestEnv } from './helpers.js';
import { companySlug, registrableDomain } from '../src/util/text.js';

let env: TestEnv;

beforeEach(() => {
  env = makeTestDb();
});
afterEach(() => env.dispose());

describe('Migrationen', () => {
  it('legt alle Tabellen an', () => {
    const tables = env.repos.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);

    for (const t of [
      'companies',
      'contacts',
      'email_addresses',
      'company_facts',
      'outreach_campaigns',
      'campaign_targets',
      'emails',
      'email_attachments',
      'interaction_history',
      'approvals',
      'tasks',
      'sources',
      'audit_logs',
      'suppression_list',
      'memory_items',
      'conversations',
      'messages',
      'settings',
    ]) {
      expect(tables, `Tabelle ${t} fehlt`).toContain(t);
    }
  });
});

describe('Normalisierung', () => {
  it('erkennt Rechtsformen als gleichwertig', () => {
    expect(companySlug('Muster Bau GmbH')).toBe(companySlug('Muster Bau  gmbh'));
    expect(companySlug('Möller & Söhne AG')).toBe('moeller-soehne');
  });

  it('reduziert Hostnamen auf die registrierbare Domain', () => {
    expect(registrableDomain('www.muster-bau.de')).toBe('muster-bau.de');
    expect(registrableDomain('mail.sub.muster-bau.de')).toBe('muster-bau.de');
    expect(registrableDomain('firma.co.uk')).toBe('firma.co.uk');
  });
});

describe('CompanyRepo', () => {
  it('verhindert Dubletten ueber Namen und Domain', () => {
    const a = env.repos.companies.upsert({ name: 'Muster Bau GmbH', website: 'https://www.muster-bau.de' });
    expect(a.created).toBe(true);

    const b = env.repos.companies.upsert({ name: 'muster bau gmbh' });
    expect(b.created).toBe(false);
    expect(b.company.id).toBe(a.company.id);

    const c = env.repos.companies.upsert({ name: 'Ganz Anderer Name', website: 'https://muster-bau.de/kontakt' });
    expect(c.created).toBe(false);
    expect(c.company.id).toBe(a.company.id);
  });

  it('ergaenzt leere Felder, ueberschreibt aber keine vorhandenen', () => {
    const a = env.repos.companies.upsert({ name: 'Hafen Logistik KG', city: 'Hamburg' });
    const b = env.repos.companies.upsert({ name: 'Hafen Logistik KG', city: 'Bremen', industry: 'Logistik' });
    expect(b.company.city).toBe('Hamburg');
    expect(b.company.industry).toBe('Logistik');
    expect(b.company.id).toBe(a.company.id);
  });

  it('wertet einen Verifizierungsstatus nie ab', () => {
    const { company } = env.repos.companies.upsert({ name: 'Testfirma', website: 'https://test-firma.de' });
    env.repos.companies.addEmailAddress({
      address: 'Info@Test-Firma.de',
      companyId: company.id,
      verification: 'VERIFIZIERT',
      foundOnUrl: 'https://test-firma.de/impressum',
    });
    const again = env.repos.companies.addEmailAddress({
      address: 'info@test-firma.de',
      companyId: company.id,
      verification: 'WAHRSCHEINLICH',
    });
    expect(again.verification).toBe('VERIFIZIERT');
    expect(env.repos.companies.emailsOf(company.id)).toHaveLength(1);
  });
});
