import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedCompany, type TestHarness } from './helpers.js';
import { parseIcs } from '../src/core/agents/CalendarAgent.js';

describe('Datenhaltung', () => {
  let harness: TestHarness;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(() => {
    harness.dispose();
  });

  it('legt dieselbe Firma nicht zweimal an', () => {
    const first = harness.runtime.repos.companies.upsert({
      name: 'Nordbau Hamburg GmbH',
      domain: 'nordbau.example',
      website: 'https://nordbau.example/',
    });
    const second = harness.runtime.repos.companies.upsert({
      name: 'Nordbau Hamburg G.m.b.H.',
      domain: 'nordbau.example',
      city: 'Hamburg',
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.company.id).toBe(first.company.id);
    // Fehlende Felder werden ergänzt, vorhandene nicht überschrieben.
    expect(second.company.city).toBe('Hamburg');
    expect(second.company.website).toBe('https://nordbau.example/');
  });

  it('erkennt Dubletten auch ohne Domain über den Namen', () => {
    const first = harness.runtime.repos.companies.upsert({ name: 'Ohne Web GmbH' });
    const second = harness.runtime.repos.companies.upsert({ name: 'ohne web gmbh' });
    expect(second.company.id).toBe(first.company.id);
  });

  it('speichert jede Adresse nur einmal je Firma und aktualisiert den Status', () => {
    const { companyId } = seedCompany(harness.runtime);
    harness.runtime.repos.companies.addEmailAddress({
      companyId,
      address: 'INFO@nordbau-hamburg.example',
      status: 'WAHRSCHEINLICH',
      reason: 'Zweiter Fund',
      sourceUrl: 'https://nordbau-hamburg.example/kontakt',
    });
    const addresses = harness.runtime.repos.companies.emailAddresses(companyId);
    expect(addresses).toHaveLength(1);
    expect(addresses[0]?.status).toBe('WAHRSCHEINLICH');
  });

  it('sortiert verifizierte Adressen nach vorn', () => {
    const { companyId } = seedCompany(harness.runtime);
    harness.runtime.repos.companies.addEmailAddress({
      companyId,
      address: 'zweit@nordbau-hamburg.example',
      status: 'NICHT_VERIFIZIERT',
      reason: 'kein MX',
    });
    const best = harness.runtime.repos.companies.bestEmailAddress(companyId, true);
    expect(best?.status).toBe('VERIFIZIERT');
    expect(harness.runtime.repos.companies.bestEmailAddress(companyId, true)?.address).toContain('info@');
  });

  it('liefert null, wenn nur unverifizierte Adressen vorliegen', () => {
    const { company } = harness.runtime.repos.companies.upsert({ name: 'Leer GmbH', domain: 'leer.example' });
    harness.runtime.repos.companies.addEmailAddress({
      companyId: company.id,
      address: 'x@leer.example',
      status: 'NICHT_VERIFIZIERT',
      reason: 'kein MX',
    });
    expect(harness.runtime.repos.companies.bestEmailAddress(company.id, true)).toBeNull();
  });

  it('führt Quellen mit Zeitpunkt und Zitat', () => {
    const { companyId } = seedCompany(harness.runtime);
    harness.runtime.repos.companies.addSource(
      companyId,
      {
        url: 'https://nordbau-hamburg.example/impressum',
        kind: 'impressum',
        excerpt: 'E-Mail: info@nordbau-hamburg.example',
        retrievedAt: new Date().toISOString(),
      },
      'email:info@nordbau-hamburg.example',
    );
    const sources = harness.runtime.repos.companies.sources(companyId);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.excerpt).toContain('info@');
  });

  it('baut die Versandzentrale mit dem neuesten Entwurf je Firma', () => {
    const { companyId, address } = seedCompany(harness.runtime);
    const draft = harness.runtime.agents.mail.createDraft({
      companyId,
      to: address,
      subject: 'Angebot',
      body: 'Ein hinreichend langer Text für den Entwurf.',
    });
    if (!draft.ok) throw new Error(draft.error.message);
    harness.runtime.agents.mail.requestSend(draft.value.id);

    const rows = harness.runtime.repos.companies.sendDeskRows({});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe(address);
    expect(rows[0]?.email_status).toBe('VERIFIZIERT');
    expect(rows[0]?.mail_status).toBe('wartet_auf_freigabe');
    expect(rows[0]?.approval_status).toBe('offen');
  });

  it('verschlüsselt Geheimnisse und gibt sie nicht im Klartext preis', () => {
    harness.runtime.services.credentials.set('anthropic.apiKey', 'sk-ant-geheim-1234');
    const raw = harness.runtime.db
      .prepare('SELECT ciphertext FROM credentials WHERE key = ?')
      .get<{ ciphertext: string }>('anthropic.apiKey');

    expect(raw?.ciphertext).toBeDefined();
    expect(raw?.ciphertext).not.toContain('sk-ant-geheim');
    expect(harness.runtime.services.credentials.get('anthropic.apiKey')).toBe('sk-ant-geheim-1234');

    const status = harness.runtime.services.credentials.status().find((entry) => entry.key === 'anthropic.apiKey');
    expect(status?.present).toBe(true);
    expect(status?.hint).toBe('1234');
  });

  it('entfernt Geheimnisse aus Protokolltexten', () => {
    harness.runtime.services.credentials.set('smtp.password', 'super-geheimes-passwort');
    harness.runtime.services.audit.log({
      actor: 'system',
      action: 'test',
      detail: 'Verbindung mit super-geheimes-passwort fehlgeschlagen',
    });
    const entry = harness.runtime.services.audit.list(1)[0];
    expect(entry?.detail).not.toContain('super-geheimes-passwort');
    expect(entry?.detail).toContain('«geheim»');
  });

  it('speichert und löscht Gedächtniseinträge', () => {
    harness.runtime.services.memory.remember('preference', 'anrede', 'Immer Sie-Form');
    expect(harness.runtime.services.memory.recall('preference', 'anrede')?.value).toBe('Immer Sie-Form');
    expect(harness.runtime.services.memory.preferenceDigest()).toContain('Sie-Form');

    const entry = harness.runtime.services.memory.list('preference')[0]!;
    expect(harness.runtime.services.memory.forget(entry.id)).toBe(true);
    expect(harness.runtime.services.memory.list('preference')).toHaveLength(0);
  });

  it('exportiert das Protokoll als CSV mit Kopfzeile', () => {
    harness.runtime.services.audit.log({ actor: 'benutzer', action: 'test.aktion', outcome: 'ok' });
    const csv = harness.runtime.services.audit.exportCsv();
    expect(csv.ok).toBe(true);
    if (csv.ok) {
      expect(csv.value.split('\r\n')[0]).toBe('Zeit;Akteur;Agent;Aktion;Objekt;Ergebnis;Detail');
      expect(csv.value).toContain('test.aktion');
    }
  });
});

describe('Kalender', () => {
  it('liest VEVENT-Blöcke inklusive gefalteter Zeilen', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Baustellenbegehung',
      ' Hafencity',
      'DTSTART:20260901T090000Z',
      'DTEND:20260901T100000Z',
      'LOCATION:Hamburg\\, Hafencity',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:Betriebsausflug',
      'DTSTART;VALUE=DATE:20260915',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const events = parseIcs(ics, 'test.ics');
    expect(events).toHaveLength(2);
    expect(events[0]?.summary).toBe('BaustellenbegehungHafencity');
    expect(events[0]?.location).toBe('Hamburg, Hafencity');
    expect(events[0]?.start).toBe('2026-09-01T09:00:00.000Z');
    expect(events[1]?.allDay).toBe(true);
  });

  it('überspringt Einträge ohne Startzeit', () => {
    const ics = 'BEGIN:VEVENT\r\nSUMMARY:Ohne Datum\r\nEND:VEVENT';
    expect(parseIcs(ics, 'x')).toHaveLength(0);
  });
});
