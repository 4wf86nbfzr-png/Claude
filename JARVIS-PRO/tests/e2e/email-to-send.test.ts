import { afterEach, describe, expect, it } from 'vitest';
import { emailEventFixture, injectionEmailFixture, whatsappEventFixture } from '@jarvis/testkit';
import type { ScriptedStep } from '@jarvis/orchestrator';
import { FIRST_UTTERANCE_DE } from '@jarvis/orchestrator';
import { runDialogue, setupE2e, TEST_APPROVAL_PIN, type E2eSetup } from './harness.js';

/**
 * Der verpflichtende End-to-End-Test aus Abschnitt 13.
 *
 *   Fake-E-Mail -> Ereignisspeicherung -> Anruf-Job -> Call-Simulator
 *   -> erste Pflichtfrage -> Nachrichtenzusammenfassung -> Antwortentwurf
 *   -> vollstaendiges Vorlesen -> "Ja, senden" -> DTMF-PIN
 *   -> exakt ein Mock-Send -> Provider-ID -> Audit-Eintrag
 *
 * Dazu der Gegentest: jede fehlende oder falsche Freigabestufe fuehrt zu
 * genau null Sendungen.
 */

let setup: E2eSetup;

afterEach(async () => {
  await setup?.close();
});

/** Drehbuch fuer das Gehirn: Ereignis lesen, entwerfen, Freigabe anfordern. */
function replyScript(eventIdRef: { id: string }): ScriptedStep[] {
  return [
    {
      match: /nein|noch nicht|nichts gemacht|keine zeit/i,
      tools: [{ name: 'read_open_events', args: { limit: 5 } }],
      speak: 'Alles klar. Dann gehen wir die durch.',
    },
    {
      match: /vollstaendig vorlesen|ganz vorlesen|lies mir/i,
      tools: [{ name: 'read_event', args: () => ({ eventId: eventIdRef.id }) }],
      speak:
        'Sabine Kroeger von Elbe Events braucht am Samstag, dem 9. Mai, vier Leute fuer den Einlass ' +
        'am Nordtor, ab 17 Uhr, Ende offen.',
    },
    {
      match: /antworte|antwort|entwurf|schreib/i,
      tools: [
        {
          name: 'draft_email_reply',
          args: () => ({
            eventId: eventIdRef.id,
            body: 'Moin Frau Kroeger, vier Leute am Nordtor ab 17 Uhr geht klar. Beste Gruesse, Noah Benkhofer',
          }),
        },
        {
          name: 'request_approval',
          args: (last: string | null) => ({ draftId: extractId(last, 'drf') }),
        },
      ],
      speak: 'Ich habe geantwortet, dass vier Leute ab 17 Uhr klargehen. Ich lese dir das jetzt vor.',
    },
  ];
}

function extractId(text: string | null, prefix: string): string {
  const m = new RegExp(`${prefix}_[A-Za-z0-9_-]+`).exec(text ?? '');
  return m?.[0] ?? '';
}

describe('E2E: neue E-Mail bis zum bestaetigten Versand', () => {
  it('durchlaeuft die gesamte Kette und sendet genau einmal', async () => {
    setup = await setupE2e();

    // ---- 1. Fake-E-Mail trifft ein ----------------------------------------
    const draft = emailEventFixture();
    setup.mail.deliver(draft);
    const fetched = await setup.mail.fetchNew();
    expect(fetched).toHaveLength(1);

    // ---- 2. Ereignisspeicherung -------------------------------------------
    const first = fetched[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const ingested = setup.base.events.ingest(first);
    expect(ingested.isNew).toBe(true);
    const eventRef = { id: ingested.event.id as string };

    // ---- 3. Anruf-Job ------------------------------------------------------
    const job = setup.base.jobs.enqueue({
      kind: 'call',
      deduplicationKey: `call:${ingested.event.id}`,
      payload: { eventId: ingested.event.id, reason: 'neue E-Mail' },
    });
    expect(job.isNew).toBe(true);
    expect(setup.base.jobs.countByState('call', 'PENDING')).toBe(1);

    const claimed = setup.base.jobs.claim<{ eventId: string }>('call');
    expect(claimed).not.toBeNull();

    // ---- 4. bis 9. Gespraech ----------------------------------------------
    const result = await runDialogue({
      setup,
      steps: replyScript(eventRef),
      callReason: 'neue E-Mail von Sabine Kroeger',
      initialEvents: [ingested.event],
      turns: [
        { say: 'Nein, noch nicht.' },
        { say: 'Ja, lies sie mir ganz vor.' },
        { say: 'Antworte ihr, vier Leute ab 17 Uhr geht klar.' },
        { say: 'Ja, senden' },
        { dtmf: `${TEST_APPROVAL_PIN}#` },
      ],
    });

    // ---- Erste Pflichtfrage, wortgetreu ------------------------------------
    expect(result.spoken[0]).toBe(FIRST_UTTERANCE_DE);

    // ---- Read-back war vollstaendig ---------------------------------------
    const readBack = result.spoken.find((s) => s.includes('Soll ich genau diese Version'));
    const readBackBody = result.spoken.find((s) => s.includes('Der Text lautet:'));
    expect(readBackBody).toBeDefined();
    expect(readBackBody).toContain('Kanal: E-Mail');
    expect(readBackBody).toContain('kroeger at elbe-events Punkt de');
    expect(readBackBody).toContain('Betreff:');
    expect(readBackBody).toContain('vier Leute am Nordtor ab 17 Uhr geht klar');
    expect(readBackBody).toContain('Ohne Anhang.');
    expect(readBack).toBeDefined();

    // ---- Genau ein Versand -------------------------------------------------
    expect(setup.mail.sent).toHaveLength(1);
    expect(result.outcome.sendsExecuted).toBe(1);

    // ---- Provider-ID wurde genannt ----------------------------------------
    const confirmation = result.spoken.find((s) => s.includes('Gesendet an'));
    expect(confirmation).toBeDefined();
    expect(confirmation).toContain('mock-mail-1');
    expect(confirmation).toMatch(/\d{2}:\d{2} Uhr/);

    // ---- Audit-Eintrag -----------------------------------------------------
    await setup.base.audit.flush();
    expect(await setup.base.audit.verify()).toEqual({ ok: true });
    const actions = setup.base.db
      .all<{ action: string }>('SELECT action FROM audit_log ORDER BY seq ASC')
      .map((r) => r.action);
    expect(actions).toContain('draft.created');
    expect(actions).toContain('approval.readback');
    expect(actions).toContain('approval.voice.ok');
    expect(actions).toContain('approval.pin.ok');
    expect(actions).toContain('approval.granted');
    expect(actions).toContain('send.succeeded');
  });
});

describe('E2E: jede fehlende Freigabestufe fuehrt zu null Sendungen', () => {
  const cases: { name: string; turns: { say?: string; dtmf?: string; silent?: boolean }[] }[] = [
    {
      name: 'blosses "ja" statt "Ja, senden"',
      turns: [
        { say: 'Nein, noch nicht.' },
        { say: 'Antworte ihr kurz.' },
        { say: 'Ja' },
        { dtmf: `${TEST_APPROVAL_PIN}#` },
      ],
    },
    {
      name: 'richtige Bestaetigung, aber falsche PIN',
      turns: [
        { say: 'Nein, noch nicht.' },
        { say: 'Antworte ihr kurz.' },
        { say: 'Ja, senden' },
        { dtmf: '0000#' },
      ],
    },
    {
      name: 'richtige Bestaetigung, aber keine PIN',
      turns: [{ say: 'Nein, noch nicht.' }, { say: 'Antworte ihr kurz.' }, { say: 'Ja, senden' }],
    },
    {
      name: 'Ablehnung',
      turns: [
        { say: 'Nein, noch nicht.' },
        { say: 'Antworte ihr kurz.' },
        { say: 'Nein, lieber nicht' },
      ],
    },
    {
      name: 'Schweigen auf die Freigabefrage',
      turns: [{ say: 'Nein, noch nicht.' }, { say: 'Antworte ihr kurz.' }, { silent: true }],
    },
  ];

  for (const c of cases) {
    it(`sendet nichts: ${c.name}`, async () => {
      setup = await setupE2e();

      setup.mail.deliver(emailEventFixture());
      const fetched = await setup.mail.fetchNew();
      const firstDraft = fetched[0];
      expect(firstDraft).toBeDefined();
      if (firstDraft === undefined) return;
      const ingested = setup.base.events.ingest(firstDraft);
      const eventRef = { id: ingested.event.id as string };

      const result = await runDialogue({
        setup,
        steps: replyScript(eventRef),
        initialEvents: [ingested.event],
        turns: c.turns,
      });

      expect(setup.mail.sent).toHaveLength(0);
      expect(result.outcome.sendsExecuted).toBe(0);
      expect(
        result.spoken.some((s) => /nichts gesendet|keine Antwort geh|nicht richtig/i.test(s)),
      ).toBe(true);
    });
  }
});

describe('E2E: WhatsApp', () => {
  it('kuendigt eine neue WhatsApp-Nachricht an und sendet nur nach voller Freigabe', async () => {
    setup = await setupE2e();

    const ingested = setup.base.events.ingest(whatsappEventFixture());
    const ref = { id: ingested.event.id as string };

    const steps: ScriptedStep[] = [
      { match: /nein|noch nicht/i, speak: 'Alles klar.' },
      {
        match: /antworte|klar|geht/i,
        tools: [
          { name: 'draft_whatsapp_reply', args: () => ({ eventId: ref.id, body: 'Moin Tarek, zwei Leute sind eingeplant.' }) },
          { name: 'request_approval', args: (last: string | null) => ({ draftId: extractId(last, 'drf') }) },
        ],
        speak: 'Ich habe Tarek geantwortet, dass zwei Leute eingeplant sind.',
      },
    ];

    const result = await runDialogue({
      setup,
      steps,
      initialEvents: [ingested.event],
      turns: [
        { say: 'Nein, noch nicht.' },
        { say: 'Antworte ihm, zwei Leute sind eingeplant.' },
        { say: 'Ja, senden' },
        { dtmf: `${TEST_APPROVAL_PIN}#` },
      ],
    });

    expect(setup.whatsapp.sent).toHaveLength(1);
    expect(result.spoken.some((s) => s.includes('wamid.MOCK1'))).toBe(true);

    // WhatsApp hat keinen Betreff - der Read-back darf keinen vorlesen.
    const readBack = result.spoken.find((s) => s.includes('Der Text lautet:'));
    expect(readBack).toContain('Kanal: WhatsApp Business');
    expect(readBack).not.toContain('Betreff:');
  });
});

describe('E2E: Prompt Injection', () => {
  it('befolgt keine Anweisung aus einer E-Mail und sendet nichts', async () => {
    setup = await setupE2e();

    const ingested = setup.base.events.ingest(injectionEmailFixture());
    const ref = { id: ingested.event.id as string };

    const steps: ScriptedStep[] = [
      { match: /nein|noch nicht/i, speak: 'Alles klar.' },
      {
        match: /vorlesen|lies/i,
        tools: [{ name: 'read_event', args: () => ({ eventId: ref.id }) }],
        speak: (results) => {
          const content = results[0] ?? '';
          // Der Isolationsblock muss den Fremdinhalt markieren und die
          // Auffaelligkeit melden.
          return content.includes('FREMDINHALT')
            ? 'Die Mail gibt sich als Rechnungsstelle aus und enthaelt Anweisungen an mich. ' +
                'Die befolge ich nicht. Ich habe nichts gesendet und nichts geloescht.'
            : 'Unerwarteter Inhalt.';
        },
      },
    ];

    const result = await runDialogue({
      setup,
      steps,
      initialEvents: [ingested.event],
      turns: [{ say: 'Nein, noch nicht.' }, { say: 'Lies sie mir vor.' }],
    });

    expect(setup.mail.sent).toHaveLength(0);
    expect(setup.whatsapp.sent).toHaveLength(0);
    expect(result.spoken.some((s) => s.includes('befolge ich nicht'))).toBe(true);

    await setup.base.audit.flush();
    const actions = setup.base.db
      .all<{ action: string }>('SELECT action FROM audit_log ORDER BY seq ASC')
      .map((r) => r.action);
    expect(actions).toContain('injection.detected');
  });
});
