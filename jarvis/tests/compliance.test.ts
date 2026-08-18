import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedCompany, type TestHarness } from './helpers.js';

describe('Versandregeln', () => {
  let harness: TestHarness;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(() => {
    harness.dispose();
  });

  it('blockiert gesperrte Unternehmen', () => {
    const { companyId, address } = seedCompany(harness.runtime);
    harness.runtime.repos.companies.setDoNotContact(companyId, true, 'Kunde hat widersprochen');

    const draft = harness.runtime.agents.mail.createDraft({
      companyId,
      to: address,
      subject: 'Test',
      body: 'Ein hinreichend langer Text für den Entwurf.',
    });
    expect(draft.ok).toBe(false);
    if (!draft.ok) expect(draft.error.code).toBe('compliance.do_not_contact');
  });

  it('blockiert Adressen auf der Sperrliste', () => {
    const { companyId, address } = seedCompany(harness.runtime);
    harness.runtime.repos.companies.suppress(address, 'address', 'Abmeldung per Mail');

    const draft = harness.runtime.agents.mail.createDraft({
      companyId,
      to: address,
      subject: 'Test',
      body: 'Ein hinreichend langer Text für den Entwurf.',
    });
    expect(draft.ok).toBe(false);
    if (!draft.ok) expect(draft.error.code).toBe('compliance.suppressed');
  });

  it('blockiert eine ganze Domain auf der Sperrliste', () => {
    const { companyId } = seedCompany(harness.runtime, { domain: 'gesperrt.example' });
    harness.runtime.repos.companies.suppress('gesperrt.example', 'domain');

    const draft = harness.runtime.agents.mail.createDraft({
      companyId,
      to: 'irgendwer@gesperrt.example',
      subject: 'Test',
      body: 'Ein hinreichend langer Text für den Entwurf.',
    });
    expect(draft.ok).toBe(false);
  });

  it('verhindert einen zweiten Erstkontakt innerhalb der Sperrfrist', async () => {
    const { companyId, address } = seedCompany(harness.runtime);

    const first = harness.runtime.agents.mail.createDraft({
      companyId,
      to: address,
      subject: 'Erstkontakt',
      body: 'Ein hinreichend langer Text für den Entwurf.',
    });
    if (!first.ok) throw new Error(first.error.message);
    const request = harness.runtime.agents.mail.requestSend(first.value.id);
    if (!request.ok) throw new Error(request.error.message);
    harness.runtime.services.approvals.decide(request.value.id, true, 'Test');
    const sent = await harness.runtime.agents.mail.sendApproved(first.value.id);
    expect(sent.ok).toBe(true);

    const second = harness.runtime.agents.mail.createDraft({
      companyId,
      to: address,
      subject: 'Nochmal',
      body: 'Ein hinreichend langer Text für den Entwurf.',
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('compliance.recent_contact');
  });

  it('lässt unverifizierte Adressen nicht zum Versand zu', () => {
    const { company } = harness.runtime.repos.companies.upsert({
      name: 'Unklar GmbH',
      domain: 'unklar.example',
      website: 'https://unklar.example/',
    });
    harness.runtime.repos.companies.addEmailAddress({
      companyId: company.id,
      address: 'kontakt@fremd.example',
      status: 'WAHRSCHEINLICH',
      reason: 'Domain weicht ab.',
      sourceUrl: 'https://unklar.example/kontakt',
    });

    const draft = harness.runtime.agents.mail.createDraft({
      companyId: company.id,
      to: 'kontakt@fremd.example',
      subject: 'Test',
      body: 'Ein hinreichend langer Text für den Entwurf.',
    });
    if (!draft.ok) throw new Error(draft.error.message);

    const request = harness.runtime.agents.mail.requestSend(draft.value.id);
    expect(request.ok).toBe(false);
    if (!request.ok) expect(request.error.code).toBe('compliance.address_unverified');
  });

  it('lehnt Adressen ab, die gar nicht recherchiert wurden', () => {
    const { companyId } = seedCompany(harness.runtime);
    const draft = harness.runtime.agents.mail.createDraft({
      companyId,
      to: 'ausgedacht@nordbau-hamburg.example',
      subject: 'Test',
      body: 'Ein hinreichend langer Text für den Entwurf.',
    });
    if (!draft.ok) throw new Error(draft.error.message);

    const request = harness.runtime.agents.mail.requestSend(draft.value.id);
    expect(request.ok).toBe(false);
    if (!request.ok) expect(request.error.code).toBe('compliance.address_unknown');
  });

  it('greift beim Tageslimit', async () => {
    harness.runtime.services.settings.update({
      compliance: {
        ...harness.runtime.services.settings.get().compliance,
        dailySendLimit: 1,
        minSecondsBetweenSends: 0,
      },
    });

    const first = seedCompany(harness.runtime, { name: 'Eins GmbH', domain: 'eins.example' });
    const second = seedCompany(harness.runtime, { name: 'Zwei GmbH', domain: 'zwei.example' });

    for (const target of [first, second]) {
      const draft = harness.runtime.agents.mail.createDraft({
        companyId: target.companyId,
        to: target.address,
        subject: 'Angebot',
        body: 'Ein hinreichend langer Text für den Entwurf.',
      });
      if (!draft.ok) throw new Error(draft.error.message);
      const request = harness.runtime.agents.mail.requestSend(draft.value.id);
      if (target === first) {
        if (!request.ok) throw new Error(request.error.message);
        harness.runtime.services.approvals.decide(request.value.id, true, 'Test');
        const sent = await harness.runtime.agents.mail.sendApproved(draft.value.id);
        expect(sent.ok).toBe(true);
      } else {
        expect(request.ok).toBe(false);
        if (!request.ok) expect(request.error.code).toBe('compliance.daily_limit');
      }
    }

    expect(harness.transport.sent).toHaveLength(1);
  });
});
