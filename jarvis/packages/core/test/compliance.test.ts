import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeJarvis, type TestJarvis } from './fakes.js';

let t: TestJarvis;

afterEach(() => t?.dispose());

function firmaMitAdresse(
  jarvis: TestJarvis['jarvis'],
  name: string,
  adresse: string,
  verification: 'VERIFIZIERT' | 'WAHRSCHEINLICH' = 'VERIFIZIERT',
): string {
  const { company } = jarvis.repos.companies.upsert({ name, website: `https://${adresse.split('@')[1]}` });
  jarvis.repos.companies.addEmailAddress({
    address: adresse,
    companyId: company.id,
    verification,
    foundOnUrl: `https://${adresse.split('@')[1]}/impressum`,
  });
  return company.id;
}

describe('Sperrliste', () => {
  beforeEach(() => {
    t = makeJarvis();
  });

  it('verhindert den Versand an eine gesperrte Adresse', async () => {
    const firmaId = firmaMitAdresse(t.jarvis, 'Gesperrt GmbH', 'info@gesperrt.de');
    t.jarvis.repos.suppression.add({ scope: 'email', value: 'info@gesperrt.de', reason: 'Widerspruch vom 01.08.2026' });

    const entwurf = await t.jarvis.mail.createDraft({
      to: 'info@gesperrt.de',
      subject: 'Angebot',
      body: 'Text',
      companyId: firmaId,
    });
    if (!entwurf.ok) throw new Error('Entwurf fehlgeschlagen');

    const anfrage = t.jarvis.mail.requestSendApproval(entwurf.data.email.id);
    expect(anfrage.ok).toBe(false);
    if (!anfrage.ok) {
      expect(anfrage.error.code).toBe('SUPPRESSED');
      expect(anfrage.error.hint).toContain('Widerspruch');
    }
    expect(t.transport.gesendet).toHaveLength(0);
  });

  it('sperrt auch ganze Domains', () => {
    firmaMitAdresse(t.jarvis, 'Konzern AG', 'kontakt@konzern.de');
    t.jarvis.repos.suppression.add({ scope: 'domain', value: 'konzern.de' });

    const r = t.jarvis.context.compliance.checkSuppression({ address: 'anderer.name@konzern.de' });
    expect(r.ok).toBe(false);
  });
});

describe('Verifizierung', () => {
  beforeEach(() => {
    t = makeJarvis();
  });

  it('lässt nur verifizierte Adressen zum Versand zu', async () => {
    const firmaId = firmaMitAdresse(t.jarvis, 'Unsicher GmbH', 'info@unsicher.de', 'WAHRSCHEINLICH');
    const entwurf = await t.jarvis.mail.createDraft({
      to: 'info@unsicher.de',
      subject: 'Angebot',
      body: 'Text',
      companyId: firmaId,
    });
    if (!entwurf.ok) throw new Error('Entwurf fehlgeschlagen');

    // Der Entwurf entsteht, aber mit sichtbarer Warnung.
    expect(entwurf.data.warnungen.map((w) => w.code)).toContain('UNVERIFIED_RECIPIENT');

    const anfrage = t.jarvis.mail.requestSendApproval(entwurf.data.email.id);
    expect(anfrage.ok).toBe(true); // Der Benutzer darf sie sehen ...
    if (!anfrage.ok) return;

    const r = await t.jarvis.approve(anfrage.data.approvalId);
    expect(r.ok).toBe(false); // ... aber der Versand scheitert.
    if (!r.ok) expect(r.error.code).toBe('UNVERIFIED_RECIPIENT');
    expect(t.transport.gesendet).toHaveLength(0);
  });

  it('weist eine Adresse ohne jeden Herkunftsnachweis ab', async () => {
    const entwurf = await t.jarvis.mail.createDraft({
      to: 'irgendwer@voellig-unbekannt.de',
      subject: 'Angebot',
      body: 'Text',
    });
    if (!entwurf.ok) throw new Error('Entwurf fehlgeschlagen');
    const anfrage = t.jarvis.mail.requestSendApproval(entwurf.data.email.id);
    if (!anfrage.ok) throw new Error('Anfrage fehlgeschlagen');

    const r = await t.jarvis.approve(anfrage.data.approvalId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('UNVERIFIED_RECIPIENT');
  });
});

describe('Dublettenschutz', () => {
  beforeEach(() => {
    t = makeJarvis();
  });

  it('erkennt eine bereits angeschriebene Firma', async () => {
    const firmaId = firmaMitAdresse(t.jarvis, 'Schon Kontakt GmbH', 'info@schon-kontakt.de');

    const erste = await t.jarvis.mail.createDraft({
      to: 'info@schon-kontakt.de',
      subject: 'Erstkontakt',
      body: 'Text',
      companyId: firmaId,
    });
    if (!erste.ok) throw new Error('Entwurf fehlgeschlagen');
    const a1 = t.jarvis.mail.requestSendApproval(erste.data.email.id);
    if (!a1.ok) throw new Error('Anfrage fehlgeschlagen');
    await t.jarvis.approve(a1.data.approvalId);
    expect(t.transport.gesendet).toHaveLength(1);

    // Zweiter Erstkontakt: der Entwurf traegt jetzt eine Warnung.
    const zweite = await t.jarvis.mail.createDraft({
      to: 'info@schon-kontakt.de',
      subject: 'Nochmal',
      body: 'Text',
      companyId: firmaId,
    });
    if (!zweite.ok) throw new Error('Entwurf fehlgeschlagen');
    const warnung = zweite.data.warnungen.find((w) => w.code === 'DUPLICATE');
    expect(warnung, 'Es muss eine Dublettenwarnung geben').toBeDefined();
    expect(warnung?.message).toContain('bereits angeschrieben');
  });
});

describe('Versandlimits', () => {
  it('greift, wenn das Stundenlimit erreicht ist', async () => {
    t = makeJarvis({ env: { JARVIS_MAX_SENDS_PER_HOUR: '1', JARVIS_MIN_SEND_INTERVAL_SECONDS: '0' } });

    const ersteId = firmaMitAdresse(t.jarvis, 'Erste GmbH', 'info@erste.de');
    const zweiteId = firmaMitAdresse(t.jarvis, 'Zweite GmbH', 'info@zweite.de');

    for (const [firmaId, adresse] of [
      [ersteId, 'info@erste.de'],
      [zweiteId, 'info@zweite.de'],
    ] as const) {
      const e = await t.jarvis.mail.createDraft({ to: adresse, subject: 'Test', body: 'Text', companyId: firmaId });
      if (!e.ok) throw new Error('Entwurf fehlgeschlagen');
      const a = t.jarvis.mail.requestSendApproval(e.data.email.id);
      if (!a.ok) throw new Error('Anfrage fehlgeschlagen');
      await t.jarvis.approve(a.data.approvalId);
    }

    expect(t.transport.gesendet).toHaveLength(1);
    const zweite = t.jarvis.repos.emails.list({ status: 'fehlgeschlagen' });
    expect(zweite[0]?.error).toContain('Versandlimit');
  });

  it('hält den Mindestabstand zwischen zwei Sendungen ein', async () => {
    t = makeJarvis({ env: { JARVIS_MIN_SEND_INTERVAL_SECONDS: '3600' } });
    const a = firmaMitAdresse(t.jarvis, 'A GmbH', 'info@a-firma.de');
    const b = firmaMitAdresse(t.jarvis, 'B GmbH', 'info@b-firma.de');

    for (const [firmaId, adresse] of [
      [a, 'info@a-firma.de'],
      [b, 'info@b-firma.de'],
    ] as const) {
      const e = await t.jarvis.mail.createDraft({ to: adresse, subject: 'Test', body: 'Text', companyId: firmaId });
      if (!e.ok) throw new Error('Entwurf fehlgeschlagen');
      const app = t.jarvis.mail.requestSendApproval(e.data.email.id);
      if (!app.ok) throw new Error('Anfrage fehlgeschlagen');
      await t.jarvis.approve(app.data.approvalId);
    }

    expect(t.transport.gesendet).toHaveLength(1);
    expect(t.jarvis.repos.emails.list({ status: 'fehlgeschlagen' })[0]?.error).toContain('Mindestabstand');
  });
});
