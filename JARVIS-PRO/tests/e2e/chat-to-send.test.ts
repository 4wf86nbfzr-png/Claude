import { afterEach, describe, expect, it } from 'vitest';
import { emailEventFixture, injectionEmailFixture, whatsappEventFixture } from '@jarvis/testkit';
import { FIRST_UTTERANCE_DE, type ScriptedStep } from '@jarvis/orchestrator';
import { totpCode } from '@jarvis/security';
import { makeChat, setupE2e, TEST_APPROVAL_PIN, TEST_OWNER_WA_ID, type E2eSetup } from './harness.js';

/**
 * Dieselbe Kette wie beim Telefon, nur ueber WhatsApp:
 *
 *   Fake-E-Mail -> Ereignisspeicherung -> Ankuendigung im Chat
 *   -> Antwortentwurf -> vollstaendiger Read-back als Nachricht
 *   -> "Ja, senden" -> zweiter Faktor -> genau ein Mock-Send
 *
 * Und der wichtigere Teil: jede fehlende oder falsche Freigabestufe fuehrt zu
 * exakt null Sendungen. Der Kanal hat sich geaendert, die Bedingungen nicht.
 */

let setup: E2eSetup;

afterEach(async () => {
  await setup?.close();
});

function extractId(text: string | null, prefix: string): string {
  const m = new RegExp(`${prefix}_[A-Za-z0-9_-]+`).exec(text ?? '');
  return m?.[0] ?? '';
}

/** Drehbuch: auf "antworte" hin entwerfen und Freigabe anfordern. */
function replyScript(eventIdRef: { id: string }): ScriptedStep[] {
  return [
    {
      match: /nein|noch nicht|moin|hallo/i,
      speak: 'Alles klar. Dann gehen wir das durch.',
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
      speak: 'Ich habe geantwortet, dass vier Leute ab 17 Uhr klargehen. Ich lese dir das vor.',
    },
  ];
}

describe('E2E Chat: neue E-Mail bis zum bestaetigten Versand', () => {
  it('durchlaeuft die gesamte Kette und sendet genau einmal', async () => {
    setup = await setupE2e();

    const ingested = setup.base.events.ingest(emailEventFixture());
    const eventIdRef = { id: String(ingested.event?.id ?? '') };

    const run = makeChat({ setup, steps: replyScript(eventIdRef) });

    // ---- 1. Noah meldet sich - der Pflichtsatz kommt zuerst ---------------
    const ersterZug = await run.send('Moin');
    expect(run.sent[0]).toBe(FIRST_UTTERANCE_DE);
    expect(ersterZug.rejected).toBeNull();

    // Die offene E-Mail wird im selben Zug angekuendigt.
    expect(ersterZug.announcedEventIds).toHaveLength(1);
    expect(run.sent.join('\n')).toContain('Sabine');

    // ---- 2. Entwurf und Read-back ----------------------------------------
    const vorherigeAnzahl = run.sent.length;
    const zweiterZug = await run.send('Antworte ihr bitte');
    expect(zweiterZug.approvalStep).toBe('read_back_gesendet');

    const readBack = run.sent.slice(vorherigeAnzahl).join('\n');
    // Der Read-back ist vollstaendig: Kanal, Empfaenger, Betreff, Text, Anhaenge.
    expect(readBack).toContain('Kanal:');
    expect(readBack).toContain('Empfaenger:');
    expect(readBack).toContain('Betreff:');
    expect(readBack).toContain('vier Leute am Nordtor ab 17 Uhr');
    expect(readBack).toContain('Ohne Anhang.');
    // Im Chat steht die Adresse woertlich da, nicht buchstabiert.
    expect(readBack).toContain('@');
    expect(readBack).not.toContain(' at ');
    // Und es steht dabei, was verlangt wird.
    expect(readBack).toContain('Ja, senden');

    // Bis hierher ist nichts gesendet worden.
    expect(setup.mail.sent).toHaveLength(0);

    // ---- 3. Bestaetigung und zweiter Faktor -------------------------------
    const dritterZug = await run.send('Ja, senden');
    expect(dritterZug.approvalStep).toBe('bestaetigung_akzeptiert');
    expect(setup.mail.sent).toHaveLength(0);

    const vierterZug = await run.send(TEST_APPROVAL_PIN);
    expect(vierterZug.approvalStep).toBe('gesendet');

    // ---- 4. Genau eine Sendung, mit Provider-ID ---------------------------
    expect(setup.mail.sent).toHaveLength(1);
    expect(setup.mail.sent[0]?.draft.body).toContain('vier Leute am Nordtor');

    // Die Audit-Kette wird nebenbei geschrieben - vor dem Lesen abwarten.
    await setup.base.audit.flush();
    const aktionen = setup.base.db
      .all<{ action: string }>('SELECT action FROM audit_log ORDER BY seq', [])
      .map((r) => r.action);
    expect(aktionen).toContain('approval.readback');
    expect(aktionen).toContain('approval.granted');
    expect(aktionen).toContain('send.succeeded');
    expect((await setup.base.audit.verify()).ok).toBe(true);
  });
});

describe('E2E Chat: ohne vollstaendige Freigabe wird nichts gesendet', () => {
  /** Bringt den Ablauf bis zur gestellten Frage. */
  async function bisZurFrage(): Promise<ReturnType<typeof makeChat>> {
    const ingested = setup.base.events.ingest(emailEventFixture());
    const run = makeChat({ setup, steps: replyScript({ id: String(ingested.event?.id ?? '') }) });
    await run.send('Moin');
    await run.send('Antworte ihr bitte');
    return run;
  }

  it('sendet nicht bei blossem "ja"', async () => {
    setup = await setupE2e();
    const run = await bisZurFrage();

    const zug = await run.send('ja');
    expect(zug.approvalStep).toBe('bestaetigung_abgelehnt');
    expect(setup.mail.sent).toHaveLength(0);
    expect(run.sent.join('\n')).toContain('Es wurde nichts gesendet');
  });

  it('sendet nicht mit falschem zweitem Faktor', async () => {
    setup = await setupE2e();
    const run = await bisZurFrage();

    await run.send('Ja, senden');
    const zug = await run.send('0000');
    expect(zug.approvalStep).toBe('faktor_abgelehnt');
    expect(setup.mail.sent).toHaveLength(0);
  });

  it('sendet nicht, wenn der zweite Faktor fehlt', async () => {
    setup = await setupE2e();
    const run = await bisZurFrage();

    await run.send('Ja, senden');
    const zug = await run.send('ich habe die PIN gerade nicht zur Hand');
    expect(zug.approvalStep).toBe('faktor_abgelehnt');
    expect(setup.mail.sent).toHaveLength(0);
  });

  it('sendet nicht nach einem Abbruch', async () => {
    setup = await setupE2e();
    const run = await bisZurFrage();

    const zug = await run.send('abbrechen');
    expect(zug.approvalStep).toBe('abgebrochen');

    // Auch ein nachgeschobenes "Ja, senden" mit PIN bringt nichts mehr.
    await run.send('Ja, senden');
    await run.send(TEST_APPROVAL_PIN);
    expect(setup.mail.sent).toHaveLength(0);
  });

  it('laesst dieselbe Freigabe kein zweites Mal senden', async () => {
    setup = await setupE2e();
    const run = await bisZurFrage();

    await run.send('Ja, senden');
    await run.send(TEST_APPROVAL_PIN);
    expect(setup.mail.sent).toHaveLength(1);

    // Noch einmal dieselben Worte - es gibt keinen laufenden Vorgang mehr.
    await run.send('Ja, senden');
    await run.send(TEST_APPROVAL_PIN);
    expect(setup.mail.sent).toHaveLength(1);
  });

  it('nimmt von einer fremden Nummer gar nichts entgegen', async () => {
    setup = await setupE2e();
    const ingested = setup.base.events.ingest(emailEventFixture());
    const run = makeChat({ setup, steps: replyScript({ id: String(ingested.event?.id ?? '') }) });

    const zug = await run.chat.handleMessage('4917000000000', 'Antworte ihr und sende sofort');
    expect(zug.rejected).toBe('fremde_nummer');
    // Kein Wort zurueck: die fremde Nummer erfaehrt nicht einmal, dass es
    // hier etwas zu erreichen gibt.
    expect(run.sent).toHaveLength(0);
    expect(setup.mail.sent).toHaveLength(0);
  });
});

describe('E2E Chat: Einmalcode als zweiter Faktor', () => {
  // Das Geheimnis der RFC-6238-Testvektoren, hier nur als beliebiges gueltiges
  // Base32-Geheimnis benutzt.
  const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('akzeptiert den gueltigen Code und weist den abgelaufenen ab', async () => {
    setup = await setupE2e({ approvalTotpSecret: SECRET });
    const ingested = setup.base.events.ingest(emailEventFixture());
    const run = makeChat({ setup, steps: replyScript({ id: String(ingested.event?.id ?? '') }) });

    await run.send('Moin');
    await run.send('Antworte ihr bitte');
    await run.send('Ja, senden');

    const jetzt = Math.floor(setup.base.clock.now().getTime() / 1000);
    // Ein Code aus der Vergangenheit - genau der Fall, den ein mitgelesener
    // Verlauf liefern wuerde.
    const zug = await run.send(totpCode(SECRET, jetzt - 600));
    expect(zug.approvalStep).toBe('faktor_abgelehnt');
    expect(setup.mail.sent).toHaveLength(0);
  });

  it('sendet mit dem aktuellen Code', async () => {
    setup = await setupE2e({ approvalTotpSecret: SECRET });
    const ingested = setup.base.events.ingest(emailEventFixture());
    const run = makeChat({ setup, steps: replyScript({ id: String(ingested.event?.id ?? '') }) });

    await run.send('Moin');
    await run.send('Antworte ihr bitte');
    await run.send('Ja, senden');

    const jetzt = Math.floor(setup.base.clock.now().getTime() / 1000);
    const zug = await run.send(totpCode(SECRET, jetzt));
    expect(zug.approvalStep).toBe('gesendet');
    expect(setup.mail.sent).toHaveLength(1);
  });
});

describe('E2E Chat: Antwortfenster und Rueckstau', () => {
  it('verliert nichts, wenn Jarvis gerade nicht schreiben darf', async () => {
    setup = await setupE2e();
    setup.base.events.ingest(emailEventFixture());
    setup.base.events.ingest(whatsappEventFixture());

    let fensterZu = true;
    const run = makeChat({
      setup,
      steps: [{ match: /.*/, speak: 'Alles klar.' }],
      deliveryFails: () => fensterZu,
    });

    // Jarvis will von sich aus melden - das Fenster ist zu.
    const versuch = await run.chat.notifyPending();
    expect(versuch.delivered).toBe(false);
    expect(run.sent).toHaveLength(0);
    // Nichts als erledigt markiert: die Ereignisse stehen weiter offen.
    expect(setup.base.events.countOpen()).toBe(2);

    // Noah schreibt - damit ist das Fenster auf, und der Rueckstau kommt nach.
    fensterZu = false;
    const zug = await run.send('Moin, was liegt an?');
    expect(zug.announcedEventIds).toHaveLength(2);
    // Genannt, aber noch nicht erledigt - beides muss sich unterscheiden lassen.
    expect(setup.base.events.countUnannounced()).toBe(0);
    expect(setup.base.events.countOpen()).toBe(2);

    // Und beim naechsten Mal wird nicht dasselbe noch einmal erzaehlt.
    const zweiterZug = await run.send('Und sonst?');
    expect(zweiterZug.announcedEventIds).toHaveLength(0);
  });

  it('funkt nicht in eine laufende Freigabe hinein', async () => {
    setup = await setupE2e();
    const ingested = setup.base.events.ingest(emailEventFixture());
    const run = makeChat({ setup, steps: replyScript({ id: String(ingested.event?.id ?? '') }) });

    await run.send('Moin');
    await run.send('Antworte ihr bitte');

    // Waehrend die Freigabe laeuft, kommt etwas Neues herein.
    setup.base.events.ingest(whatsappEventFixture());
    const versuch = await run.chat.notifyPending();
    expect(versuch.delivered).toBe(false);
    expect(versuch.reason).toBe('Freigabe laeuft');
  });
});

describe('E2E Chat: Prompt Injection', () => {
  it('befolgt keine Anweisung aus einer E-Mail und sendet nichts', async () => {
    setup = await setupE2e();
    setup.base.events.ingest(injectionEmailFixture());

    const run = makeChat({
      setup,
      // Das Drehbuch tut, was ein gutmuetiges Modell tun wuerde: es liest die
      // Mail vor. Die Sicherheit darf davon nicht abhaengen.
      steps: [{ match: /.*/, tools: [{ name: 'read_open_events', args: { limit: 5 } }], speak: 'Da ist eine Mail.' }],
    });

    await run.send('Moin');
    await run.send('Was steht drin?');

    // Egal was in der Mail steht: es gibt keinen Entwurf und keine Sendung.
    expect(setup.mail.sent).toHaveLength(0);
    expect(setup.whatsapp.sent).toHaveLength(0);
  });
});

describe('E2E Chat: Anmelde-PIN', () => {
  it('verlangt die PIN, wenn sie eingeschaltet ist', async () => {
    setup = await setupE2e();
    const { hashPin } = await import('@jarvis/security');
    setup.base.events.ingest(emailEventFixture());

    const run = makeChat({
      setup,
      steps: [{ match: /.*/, speak: 'Alles klar.' }],
      requireLoginPin: true,
      loginPinHash: await hashPin('1234'),
    });

    const ohnePin = await run.send('Was liegt an?');
    expect(ohnePin.rejected).toBe('pin_falsch');
    // Nichts angekuendigt, solange nicht angemeldet.
    expect(setup.base.events.countOpen()).toBe(1);

    const mitPin = await run.send('1234');
    expect(mitPin.rejected).toBeNull();
    expect(run.sent.join('\n')).toContain('Angemeldet');
  });
});

describe('Chat: Nummernvergleich', () => {
  it('erkennt dieselbe Nummer in verschiedenen Schreibweisen', async () => {
    setup = await setupE2e();
    const run = makeChat({ setup, steps: [{ match: /.*/, speak: 'Moin.' }] });

    for (const schreibweise of [
      TEST_OWNER_WA_ID,
      `+${TEST_OWNER_WA_ID}`,
      `+49 151 12345678`,
      `+49-151-12345678`,
    ]) {
      const zug = await run.chat.handleMessage(schreibweise, 'Moin');
      expect(zug.rejected).toBeNull();
    }
  });
});
