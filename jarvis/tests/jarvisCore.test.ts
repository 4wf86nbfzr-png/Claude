import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, seedCompany, ScriptedLlm, type TestHarness } from './helpers.js';
import type { LlmResponse } from '../src/core/llm/types.js';

const text = (value: string): LlmResponse => ({
  content: [{ type: 'text', text: value }],
  stopReason: 'end_turn',
});

const call = (name: string, input: Record<string, unknown>, id = `t${Math.random().toString(36).slice(2, 8)}`): LlmResponse => ({
  content: [{ type: 'tool_use', id, name, input }],
  stopReason: 'tool_use',
});

describe('JarvisCore — vollständiger Ablauf', () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.dispose();
    harness = null;
  });

  /**
   * Seeds a company first, then lets the caller queue the model turns — the
   * script usually needs the seeded address.
   */
  function setup(
    build: (seed: { companyId: number; address: string }) => LlmResponse[],
  ): { harness: TestHarness; llm: ScriptedLlm; companyId: number; address: string } {
    const llm = new ScriptedLlm();
    const created = createHarness({ llm });
    harness = created;
    const seeded = seedCompany(created.runtime);
    llm.queue(...build(seeded));
    return { harness: created, llm, ...seeded };
  }

  it('führt Entwurf → Freigabeanfrage → Freigabe → Versand in dieser Reihenfolge aus', async () => {
    const { harness: env, address, companyId } = setup(({ address, companyId }) => [
      call('create_email_draft', {
        to: address,
        companyId,
        subject: 'Baustellenbewachung in Hamburg',
        body: 'Moin, wir sichern Baustellen im Hamburger Raum rund um die Uhr. Viele Grüße',
      }),
      text('Der Entwurf steht. Soll ich die Freigabe vorbereiten?'),
      call('request_send_approval', { emailId: 1 }),
      text('Bitte prüfen und freigeben.'),
      call('send_email', { emailId: 1 }),
      text('Die Nachricht wurde versendet.'),
    ]);

    const conversation = env.runtime.core.newConversation();

    await env.runtime.core.handle({ text: 'Bereite eine Akquise-Mail für Nordbau vor.', conversationId: conversation });
    expect(env.runtime.repos.emails.list({ limit: 10 })).toHaveLength(1);
    expect(env.transport.sent).toHaveLength(0);

    await env.runtime.core.handle({ text: 'Ja, hol die Freigabe ein.', conversationId: conversation });
    const open = env.runtime.services.approvals.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0]?.preview).toContain('Baustellen');
    expect(open[0]?.facts.some((fact) => fact.label === 'Empfänger' && fact.value === address)).toBe(true);
    expect(env.transport.sent).toHaveLength(0);

    // Erst die eindeutige Freigabe schaltet den Versand frei.
    await env.runtime.core.handle({ text: 'Senden.', conversationId: conversation, spoken: true });
    expect(env.transport.sent).toHaveLength(1);
    expect(env.runtime.repos.emails.get(1)?.status).toBe('gesendet');
  });

  it('versendet nicht, wenn das Modell send_email ohne Freigabe aufruft', async () => {
    const { harness: env, address, companyId } = setup(({ address, companyId }) => [
      call('create_email_draft', {
        to: address,
        companyId,
        subject: 'Baustellenbewachung',
        body: 'Moin, wir sichern Baustellen im Hamburger Raum. Viele Grüße',
      }),
      call('send_email', { emailId: 1 }),
      text('Der Versand ist fehlgeschlagen, es fehlt Ihre Freigabe.'),
    ]);

    const conversation = env.runtime.core.newConversation();
    const result = await env.runtime.core.handle({
      text: 'Schreib und verschick das sofort.',
      conversationId: conversation,
    });

    expect(result.ok).toBe(true);
    expect(env.transport.sent).toHaveLength(0);

    const failures = env.runtime.services.audit
      .list(100)
      .filter((entry) => entry.action === 'werkzeug.send_email' && entry.outcome === 'fehler');
    expect(failures).toHaveLength(1);
    expect(failures[0]?.detail).toContain('approval.missing');
  });

  it('wertet eine unklare Äußerung nicht als Freigabe', async () => {
    const { harness: env, address, companyId } = setup(({ address, companyId }) => [
      call('create_email_draft', {
        to: address,
        companyId,
        subject: 'Baustellenbewachung',
        body: 'Moin, wir sichern Baustellen im Hamburger Raum. Viele Grüße',
      }),
      call('request_send_approval', { emailId: 1 }),
      text('Bitte prüfen.'),
      text('Ich frage sicherheitshalber nach: Soll ich wirklich senden?'),
    ]);

    const conversation = env.runtime.core.newConversation();
    await env.runtime.core.handle({ text: 'Entwurf vorbereiten und Freigabe holen.', conversationId: conversation });
    expect(env.runtime.services.approvals.listOpen()).toHaveLength(1);

    await env.runtime.core.handle({ text: 'Vielleicht später senden.', conversationId: conversation, spoken: true });

    // Freigabe bleibt offen, nichts wurde versendet.
    expect(env.runtime.services.approvals.listOpen()).toHaveLength(1);
    expect(env.transport.sent).toHaveLength(0);

    const lastRequest = (env.runtime.llm() as { ok: true; value: ScriptedLlm }).value.requests.at(-1);
    expect(JSON.stringify(lastRequest?.messages)).toContain('KEINE eindeutige Freigabe');
  });

  it('nimmt eine gesprochene Ablehnung an und sendet nicht', async () => {
    const { harness: env, address, companyId } = setup(({ address, companyId }) => [
      call('create_email_draft', {
        to: address,
        companyId,
        subject: 'Baustellenbewachung',
        body: 'Moin, wir sichern Baustellen im Hamburger Raum. Viele Grüße',
      }),
      call('request_send_approval', { emailId: 1 }),
      text('Bitte prüfen.'),
      text('In Ordnung, ich versende nichts.'),
    ]);

    const conversation = env.runtime.core.newConversation();
    await env.runtime.core.handle({ text: 'Entwurf und Freigabe.', conversationId: conversation });
    await env.runtime.core.handle({ text: 'Abbrechen.', conversationId: conversation, spoken: true });

    expect(env.runtime.services.approvals.listOpen()).toHaveLength(0);
    expect(env.transport.sent).toHaveLength(0);
    const decided = env.runtime.repos.approvals.list(5)[0];
    expect(decided?.status).toBe('abgelehnt');
  });

  it('gibt bei mehreren offenen Freigaben nichts frei, sondern fragt nach', async () => {
    const { harness: env, address, companyId } = setup(({ address, companyId }) => [text('…')]);
    const conversation = env.runtime.core.newConversation();

    const second = seedCompany(env.runtime, { name: 'Elbe Hochbau GmbH', domain: 'elbe.example' });
    for (const target of [{ companyId, address }, second]) {
      const draft = env.runtime.agents.mail.createDraft({
        companyId: target.companyId,
        to: target.address,
        subject: 'Baustellenbewachung',
        body: 'Moin, wir sichern Baustellen im Hamburger Raum. Viele Grüße',
      });
      if (!draft.ok) throw new Error(draft.error.message);
      env.runtime.agents.mail.requestSend(draft.value.id);
    }
    expect(env.runtime.services.approvals.listOpen()).toHaveLength(2);

    await env.runtime.core.handle({ text: 'Senden.', conversationId: conversation, spoken: true });

    expect(env.runtime.services.approvals.listOpen()).toHaveLength(2);
    expect(env.transport.sent).toHaveLength(0);
  });

  it('meldet Werkzeugfehler ehrlich an das Modell weiter', async () => {
    const { harness: env } = setup(({ address, companyId }) => [
      call('read_email_draft', { emailId: 999 }),
      text('Diesen Entwurf gibt es nicht.'),
    ]);
    const conversation = env.runtime.core.newConversation();
    await env.runtime.core.handle({ text: 'Lies mir Entwurf 999 vor.', conversationId: conversation });

    const llm = (env.runtime.llm() as { ok: true; value: ScriptedLlm }).value;
    const lastMessages = JSON.stringify(llm.requests.at(-1)?.messages);
    expect(lastMessages).toContain('mail.not_found');
  });

  it('gibt jede Werkzeugaktion als Ereignis und Protokolleintrag aus', async () => {
    const { harness: env } = setup(({ address, companyId }) => [call('system_status', {}), text('Alles bereit.')]);
    const conversation = env.runtime.core.newConversation();
    await env.runtime.core.handle({ text: 'Wie ist der Stand?', conversationId: conversation });

    const toolEvents = env.events.filter((event) => event.type === 'tool');
    expect(toolEvents.length).toBeGreaterThanOrEqual(2); // running + ok
    expect(env.runtime.services.audit.list(20).some((entry) => entry.action === 'werkzeug.system_status')).toBe(true);
  });

  it('nimmt keinen zweiten Auftrag an, solange einer läuft', async () => {
    const { harness: env } = setup(({ address, companyId }) => [text('Fertig.')]);
    const conversation = env.runtime.core.newConversation();
    const first = env.runtime.core.handle({ text: 'Erste Aufgabe', conversationId: conversation });
    const second = await env.runtime.core.handle({ text: 'Zweite Aufgabe', conversationId: conversation });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('core.busy');
    await first;
  });
});
