import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedCompany, type TestHarness } from './helpers.js';

/**
 * The rule the whole application exists to enforce (§2):
 * no e-mail leaves the machine without an explicit, current human approval.
 */
describe('Versandsperre', () => {
  let harness: TestHarness;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(() => {
    harness.dispose();
  });

  function draft(): number {
    const { companyId, address } = seedCompany(harness.runtime);
    const created = harness.runtime.agents.mail.createDraft({
      companyId,
      to: address,
      subject: 'Baustellenbewachung in Hamburg',
      body: 'Moin, wir sichern Baustellen im Hamburger Raum. Viele Grüße',
    });
    if (!created.ok) throw new Error(created.error.message);
    return created.value.id;
  }

  it('versendet nicht ohne Freigabe', async () => {
    const id = draft();
    const result = await harness.runtime.agents.mail.sendApproved(id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('approval.missing');
    expect(harness.transport.sent).toHaveLength(0);
  });

  it('versendet nicht, solange die Freigabe nur angefragt ist', async () => {
    const id = draft();
    const request = harness.runtime.agents.mail.requestSend(id);
    expect(request.ok).toBe(true);

    const result = await harness.runtime.agents.mail.sendApproved(id);
    expect(result.ok).toBe(false);
    expect(harness.transport.sent).toHaveLength(0);
  });

  it('versendet nach erteilter Freigabe genau einmal', async () => {
    const id = draft();
    const request = harness.runtime.agents.mail.requestSend(id);
    if (!request.ok) throw new Error(request.error.message);

    harness.runtime.services.approvals.decide(request.value.id, true, 'Test: „senden"');

    const first = await harness.runtime.agents.mail.sendApproved(id);
    expect(first.ok).toBe(true);
    expect(harness.transport.sent).toHaveLength(1);
    expect(harness.transport.sent[0]?.to).toContain('@');

    // Zweiter Versuch mit derselben Freigabe muss scheitern.
    const second = await harness.runtime.agents.mail.sendApproved(id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(['approval.missing', 'compliance.already_sent']).toContain(second.error.code);
    expect(harness.transport.sent).toHaveLength(1);
  });

  it('macht die Freigabe durch eine Änderung am Entwurf ungültig', async () => {
    const id = draft();
    const request = harness.runtime.agents.mail.requestSend(id);
    if (!request.ok) throw new Error(request.error.message);
    harness.runtime.services.approvals.decide(request.value.id, true, 'Test');

    const changed = harness.runtime.agents.mail.updateDraft(id, { body: 'Ein anderer Text.' });
    expect(changed.ok).toBe(true);

    const result = await harness.runtime.agents.mail.sendApproved(id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('approval.stale');
    expect(harness.transport.sent).toHaveLength(0);
  });

  it('versendet nicht nach einer Ablehnung', async () => {
    const id = draft();
    const request = harness.runtime.agents.mail.requestSend(id);
    if (!request.ok) throw new Error(request.error.message);
    harness.runtime.services.approvals.decide(request.value.id, false, 'Test: „abbrechen"');

    const result = await harness.runtime.agents.mail.sendApproved(id);
    expect(result.ok).toBe(false);
    expect(harness.transport.sent).toHaveLength(0);
  });

  it('versendet nicht mit einer abgelaufenen Freigabe', async () => {
    const id = draft();
    const email = harness.runtime.repos.emails.get(id)!;
    // Freigabe direkt anlegen und sofort ablaufen lassen.
    const request = harness.runtime.services.approvals.request({
      action: 'email.send',
      title: 'Test',
      facts: [],
      subject: `email:${id}`,
      fingerprint: harness.runtime.agents.mail.fingerprintOf(email),
      ttlSeconds: -1,
    });
    harness.runtime.services.approvals.decide(request.id, true, 'Test');

    const result = await harness.runtime.agents.mail.sendApproved(id);
    expect(result.ok).toBe(false);
    expect(harness.transport.sent).toHaveLength(0);
  });

  it('meldet einen fehlgeschlagenen Versand als Fehler und nicht als Erfolg', async () => {
    const id = draft();
    const request = harness.runtime.agents.mail.requestSend(id);
    if (!request.ok) throw new Error(request.error.message);
    harness.runtime.services.approvals.decide(request.value.id, true, 'Test');

    harness.transport.failWith = {
      code: 'mail.rejected',
      message: 'Der Server hat den Empfänger abgelehnt.',
    };

    const result = await harness.runtime.agents.mail.sendApproved(id);
    expect(result.ok).toBe(false);

    const stored = harness.runtime.repos.emails.get(id)!;
    expect(stored.status).toBe('fehlgeschlagen');
    expect(stored.sentAt).toBeFalsy();
    expect(stored.errorMessage).toContain('abgelehnt');

    const log = harness.runtime.services.audit.list(50);
    expect(log.some((entry) => entry.action === 'versand.fehlgeschlagen')).toBe(true);
    expect(log.some((entry) => entry.action === 'versand.erfolgreich')).toBe(false);
  });

  it('protokolliert den vollständigen Ablauf nachvollziehbar', async () => {
    const id = draft();
    const request = harness.runtime.agents.mail.requestSend(id);
    if (!request.ok) throw new Error(request.error.message);
    harness.runtime.services.approvals.decide(request.value.id, true, 'Test: „freigeben"');
    await harness.runtime.agents.mail.sendApproved(id);

    const actions = harness.runtime.services.audit.list(100).map((entry) => entry.action);
    for (const expected of [
      'entwurf.erstellt',
      'freigabe.angefragt',
      'freigabe.erteilt',
      'freigabe.eingeloest',
      'versand.gestartet',
      'versand.erfolgreich',
    ]) {
      expect(actions, expected).toContain(expected);
    }
  });

  it('kennzeichnet Sammelversand als Einzelfreigaben', () => {
    const first = draft();
    const { companyId, address } = seedCompany(harness.runtime, {
      name: 'Elbe Hochbau GmbH',
      domain: 'elbe-hochbau.example',
    });
    const secondDraft = harness.runtime.agents.mail.createDraft({
      companyId,
      to: address,
      subject: 'Baustellenbewachung',
      body: 'Moin, kurzer Hinweis zu unserer Baustellenbewachung. Viele Grüße',
    });
    if (!secondDraft.ok) throw new Error(secondDraft.error.message);

    const bulk = harness.runtime.agents.mail.requestBulkSend([first, secondDraft.value.id]);
    expect(bulk.requested).toHaveLength(2);
    // Zwei getrennte Freigaben, kein Sammelschalter.
    expect(new Set(bulk.requested.map((request) => request.subject)).size).toBe(2);
    expect(harness.transport.sent).toHaveLength(0);
  });
});
