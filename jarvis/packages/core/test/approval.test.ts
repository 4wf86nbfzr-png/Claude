import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeJarvis, type TestJarvis } from './fakes.js';
import type { ActionPermit } from '../src/services/approval.js';

/**
 * Die wichtigste Regel des Projekts:
 * JARVIS darf eine E-Mail niemals allein versenden.
 *
 * Diese Datei prueft das nicht an der Formulierung des Prompts, sondern am
 * Code: ohne gueltigen Freigabenachweis kommt keine Nachricht durch.
 */

let t: TestJarvis;

beforeEach(() => {
  t = makeJarvis();
});
afterEach(() => t?.dispose());

async function entwurf(): Promise<string> {
  const { company } = t.jarvis.repos.companies.upsert({ name: 'Muster Bau GmbH', website: 'https://muster-bau.de' });
  t.jarvis.repos.companies.addEmailAddress({
    address: 'info@muster-bau.de',
    companyId: company.id,
    verification: 'VERIFIZIERT',
    verifyNote: 'Impressum',
    foundOnUrl: 'https://muster-bau.de/impressum',
  });
  const r = await t.jarvis.mail.createDraft({
    to: 'info@muster-bau.de',
    subject: 'Sicherheitsdienstleistungen für Ihre Baustellen',
    body: 'Sehr geehrte Damen und Herren,\n\nwir bewachen Baustellen im Raum Hamburg.\n\nMit freundlichen Grüßen',
    companyId: company.id,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.data.email.id;
}

describe('Versand ohne Freigabe', () => {
  it('wird ohne Nachweis abgelehnt', async () => {
    const id = await entwurf();
    const r = await t.jarvis.mail.send(id, null);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('APPROVAL_MISSING');
    expect(t.transport.gesendet).toHaveLength(0);
  });

  it('wird mit selbstgebautem Nachweis abgelehnt', async () => {
    const id = await entwurf();
    const email = t.jarvis.repos.emails.get(id)!;

    // Ein Agent koennte versuchen, sich einen Permit zusammenzubauen.
    const gefaelscht: ActionPermit = {
      approvalId: 'apr_erfunden',
      actionType: 'mail.senden',
      contentHash: email.content_hash,
      issuedAt: new Date().toISOString(),
      signature: 'a'.repeat(64),
    };

    const r = await t.jarvis.mail.send(id, gefaelscht);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('APPROVAL_MISSING');
    expect(t.transport.gesendet).toHaveLength(0);
  });

  it('protokolliert den abgelehnten Versuch', async () => {
    const id = await entwurf();
    await t.jarvis.mail.send(id, null);

    const log = t.jarvis.audit.list({ limit: 20 });
    const eintrag = log.find((l) => l.action === 'mail.versand_verweigert');
    expect(eintrag, 'Der Versuch muss im Protokoll stehen').toBeDefined();
    expect(eintrag?.outcome).toBe('fehler');
  });

  it('gibt es kein Tool, mit dem das Modell selbst versenden könnte', () => {
    const namen = t.jarvis.registry.names();
    expect(namen).not.toContain('send_email');
    // Es gibt nur den Weg über die Freigabe.
    expect(namen).toContain('request_send_approval');
  });
});

describe('Versand mit Freigabe', () => {
  it('geht erst nach der Bestätigung des Benutzers raus', async () => {
    const id = await entwurf();

    const anfrage = t.jarvis.mail.requestSendApproval(id);
    expect(anfrage.ok).toBe(true);
    if (!anfrage.ok) return;

    // Noch ist nichts passiert.
    expect(t.transport.gesendet).toHaveLength(0);
    expect(t.jarvis.repos.emails.get(id)?.status).toBe('wartet_auf_freigabe');

    const r = await t.jarvis.approve(anfrage.data.approvalId);
    expect(r.ok, r.ok ? '' : r.error.message).toBe(true);

    expect(t.transport.gesendet).toHaveLength(1);
    expect(t.transport.gesendet[0]?.to[0]?.address).toBe('info@muster-bau.de');
    expect(t.jarvis.repos.emails.get(id)?.status).toBe('gesendet');
  });

  it('verfällt, wenn der Text nach der Freigabeanfrage geändert wird', async () => {
    const id = await entwurf();
    const anfrage = t.jarvis.mail.requestSendApproval(id);
    if (!anfrage.ok) throw new Error('Anfrage fehlgeschlagen');

    t.jarvis.mail.updateDraft(id, { body: 'Ganz anderer Text, den niemand freigegeben hat.' });

    const r = await t.jarvis.approve(anfrage.data.approvalId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('APPROVAL_STALE');
    expect(t.transport.gesendet).toHaveLength(0);
  });

  it('lässt dieselbe Freigabe nicht zweimal benutzen', async () => {
    const id = await entwurf();
    const anfrage = t.jarvis.mail.requestSendApproval(id);
    if (!anfrage.ok) throw new Error('Anfrage fehlgeschlagen');

    await t.jarvis.approve(anfrage.data.approvalId);
    const zweiterVersuch = await t.jarvis.approve(anfrage.data.approvalId);

    expect(zweiterVersuch.ok).toBe(false);
    expect(t.transport.gesendet).toHaveLength(1);
  });

  it('meldet einen Fehlschlag als Fehlschlag, nicht als Erfolg', async () => {
    const id = await entwurf();
    t.transport.scheitertMit = 'Mailbox unavailable (550)';

    const anfrage = t.jarvis.mail.requestSendApproval(id);
    if (!anfrage.ok) throw new Error('Anfrage fehlgeschlagen');
    const r = await t.jarvis.approve(anfrage.data.approvalId);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('550');
    expect(t.jarvis.repos.emails.get(id)?.status).toBe('fehlgeschlagen');
    expect(t.jarvis.repos.emails.get(id)?.error).toContain('550');
  });

  it('führt eine abgelehnte Freigabe nicht aus', async () => {
    const id = await entwurf();
    const anfrage = t.jarvis.mail.requestSendApproval(id);
    if (!anfrage.ok) throw new Error('Anfrage fehlgeschlagen');

    t.jarvis.reject(anfrage.data.approvalId, 'Doch nicht');
    const r = await t.jarvis.approve(anfrage.data.approvalId);

    expect(r.ok).toBe(false);
    expect(t.transport.gesendet).toHaveLength(0);
  });
});

describe('Serienversand', () => {
  it('sendet nur die Mails, die in der freigegebenen Liste standen', async () => {
    const a = await entwurf();

    const { company } = t.jarvis.repos.companies.upsert({ name: 'Zweite Firma GmbH', website: 'https://zweite-firma.de' });
    t.jarvis.repos.companies.addEmailAddress({
      address: 'kontakt@zweite-firma.de',
      companyId: company.id,
      verification: 'VERIFIZIERT',
      foundOnUrl: 'https://zweite-firma.de/impressum',
    });
    const zweiter = await t.jarvis.mail.createDraft({
      to: 'kontakt@zweite-firma.de',
      subject: 'Baustellenbewachung',
      body: 'Guten Tag,\n\nkurze Anfrage.\n\nMit freundlichen Grüßen',
      companyId: company.id,
    });
    if (!zweiter.ok) throw new Error('Entwurf fehlgeschlagen');

    const sammel = t.jarvis.mail.requestBulkApproval([a]);
    if (!sammel.ok) throw new Error('Sammelfreigabe fehlgeschlagen');

    const r = await t.jarvis.approve(sammel.data.approvalId);
    expect(r.ok).toBe(true);

    // Nur die freigegebene Mail ging raus.
    expect(t.transport.gesendet).toHaveLength(1);
    expect(t.jarvis.repos.emails.get(zweiter.data.email.id)?.status).not.toBe('gesendet');
  });
});
