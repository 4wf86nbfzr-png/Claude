import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonicalizeDraft, isValidVoiceConfirmation, type ApprovalId } from '@jarvis/domain';
import { verifyChain, type AuditEntry } from '@jarvis/security';
import {
  createHarness,
  CALL_ID_FIXTURE,
  TEST_APPROVAL_PIN,
  type Harness,
  type RecordingSender,
} from '@jarvis/testkit';
import { ApprovalError } from './errors.js';
import { buildReadBack } from './read-back.js';

/**
 * Diese Datei ist der Beweis fuer Abschnitt 10 der Anforderung.
 * Jeder Test entspricht genau einer der geforderten Aussagen; die Messgroesse
 * ist immer `sender.sent.length` - also ob tatsaechlich etwas gesendet wurde.
 */

const DRAFT = {
  channel: 'email' as const,
  providerAccount: 'noah@hermserviceteam.com',
  recipient: 'kroeger@elbe-events.de',
  subject: 'Re: Sicherheitsdienst fuer Hafengeburtstag',
  body: 'Moin Frau Kroeger, vier Leute am Nordtor ab 17 Uhr geht klar. Beste Gruesse, Noah Benkhofer',
  attachments: [],
  threadId: 'thread-1',
  inReplyToEventId: null,
};

let h: Harness;
let sender: RecordingSender;

beforeEach(async () => {
  h = await createHarness();
  const s = h.recordingSenders.get('email');
  if (s === undefined) throw new Error('Testaufbau fehlerhaft');
  sender = s;
});

afterEach(async () => {
  await h.close();
});

/** Der vollstaendige, korrekte Ablauf - als Baustein fuer die Negativtests. */
async function runHappyPath(): Promise<{ approvalId: ApprovalId }> {
  const draft = h.engine.createDraft(DRAFT);
  const { approval, script } = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);
  h.engine.markReadBackComplete(approval.id, script.full);
  h.engine.awaitApproval(approval.id);
  expect(h.engine.confirmVoice(approval.id, 'Ja, senden').accepted).toBe(true);
  expect((await h.engine.confirmPin(approval.id, TEST_APPROVAL_PIN)).accepted).toBe(true);
  return { approvalId: approval.id };
}

describe('Approval Engine - Erfolgspfad', () => {
  it('sendet genau einmal, wenn alle Stufen durchlaufen wurden', async () => {
    const { approvalId } = await runHappyPath();
    const result = await h.engine.execute(approvalId);

    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toBe('prov-email-1');
    expect(sender.sent).toHaveLength(1);
    expect(h.approvals.byIdOrThrow(approvalId).state).toBe('SENT');
  });

  it('nennt nach dem Versand Empfaenger, Zeitpunkt und Provider-ID', async () => {
    const { approvalId } = await runHappyPath();
    const result = await h.engine.execute(approvalId);

    expect(result.spokenDe).toContain('kroeger@elbe-events.de');
    expect(result.spokenDe).toContain('prov-email-1');
    expect(result.spokenDe).toMatch(/\d{2}:\d{2} Uhr/);
  });

  it('schreibt eine lueckenlose Audit-Kette', async () => {
    const { approvalId } = await runHappyPath();
    await h.engine.execute(approvalId);
    await h.audit.flush();

    expect(await h.audit.verify()).toEqual({ ok: true });

    const actions = auditActions(h);
    expect(actions).toContain('draft.created');
    expect(actions).toContain('approval.readback');
    expect(actions).toContain('approval.voice.ok');
    expect(actions).toContain('approval.pin.ok');
    expect(actions).toContain('approval.granted');
    expect(actions).toContain('send.succeeded');
  });
});

describe('Approval Engine - ohne Read-back kein Versand', () => {
  it('verweigert die Sprachbestaetigung, solange nichts vorgelesen wurde', async () => {
    const draft = h.engine.createDraft(DRAFT);
    const { approval } = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);

    // awaitApproval ist aus DRAFT heraus gar nicht erlaubt.
    expect(() => h.engine.awaitApproval(approval.id)).toThrow(/Unzulaessiger Freigabe-Uebergang/);
    expect(sender.sent).toHaveLength(0);
  });

  it('verweigert den Versand direkt aus DRAFT heraus', async () => {
    const draft = h.engine.createDraft(DRAFT);
    const { approval } = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);

    await expect(h.engine.execute(approval.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
    expect(sender.sent).toHaveLength(0);
  });

  it('erkennt einen vorgetaeuschten Read-back, der nicht dem Entwurf entspricht', async () => {
    const draft = h.engine.createDraft(DRAFT);
    const { approval } = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);

    expect(() => h.engine.markReadBackComplete(approval.id, 'Alles vorgelesen, passt schon.')).toThrow(
      ApprovalError,
    );
    expect(h.approvals.byIdOrThrow(approval.id).state).toBe('DRAFT');
    expect(sender.sent).toHaveLength(0);
  });
});

describe('Approval Engine - Sprachbestaetigung', () => {
  it.each([
    'ja',
    'Ja.',
    'okay',
    'passt',
    'mach das',
    'jo, klar',
    'ja, senden wir das morgen',
    'nein, nicht senden',
    'ja, nicht senden',
    'senden',
  ])('lehnt "%s" als Bestaetigung ab', async (utterance) => {
    const draft = h.engine.createDraft(DRAFT);
    const { approval, script } = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);
    h.engine.markReadBackComplete(approval.id, script.full);
    h.engine.awaitApproval(approval.id);

    expect(h.engine.confirmVoice(approval.id, utterance).accepted).toBe(false);
    await expect(h.engine.confirmPin(approval.id, TEST_APPROVAL_PIN)).rejects.toMatchObject({
      code: 'VOICE_CONFIRMATION_INVALID',
    });
    expect(sender.sent).toHaveLength(0);
  });

  it.each(['Ja, senden', 'ja senden', 'Ja, bitte senden', 'Ja, jetzt abschicken'])(
    'akzeptiert "%s"',
    (utterance) => {
      expect(isValidVoiceConfirmation(utterance)).toBe(true);
    },
  );
});

describe('Approval Engine - DTMF-PIN', () => {
  it('sendet nicht bei falscher PIN', async () => {
    const draft = h.engine.createDraft(DRAFT);
    const { approval, script } = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);
    h.engine.markReadBackComplete(approval.id, script.full);
    h.engine.awaitApproval(approval.id);
    h.engine.confirmVoice(approval.id, 'Ja, senden');

    const res = await h.engine.confirmPin(approval.id, '9999');
    expect(res.accepted).toBe(false);
    expect(h.approvals.byIdOrThrow(approval.id).state).toBe('AWAITING_APPROVAL');

    await expect(h.engine.execute(approval.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
    expect(sender.sent).toHaveLength(0);
  });

  it('sendet nicht ohne PIN', async () => {
    const draft = h.engine.createDraft(DRAFT);
    const { approval, script } = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);
    h.engine.markReadBackComplete(approval.id, script.full);
    h.engine.awaitApproval(approval.id);
    h.engine.confirmVoice(approval.id, 'Ja, senden');

    await expect(h.engine.confirmPin(approval.id, null)).rejects.toMatchObject({ code: 'PIN_MISSING' });
    await expect(h.engine.execute(approval.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
    expect(sender.sent).toHaveLength(0);
  });

  it('erlaubt die richtige PIN nach einem Fehlversuch', async () => {
    const draft = h.engine.createDraft(DRAFT);
    const { approval, script } = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);
    h.engine.markReadBackComplete(approval.id, script.full);
    h.engine.awaitApproval(approval.id);
    h.engine.confirmVoice(approval.id, 'Ja, senden');

    expect((await h.engine.confirmPin(approval.id, '0000')).accepted).toBe(false);
    expect((await h.engine.confirmPin(approval.id, TEST_APPROVAL_PIN)).accepted).toBe(true);
    await h.engine.execute(approval.id);
    expect(sender.sent).toHaveLength(1);
  });
});

describe('Approval Engine - Ablauf der Frist', () => {
  it('sendet nicht mit abgelaufener Freigabe', async () => {
    const { approvalId } = await runHappyPath();
    h.clock.advanceSeconds(181);

    await expect(h.engine.execute(approvalId)).rejects.toMatchObject({ code: 'EXPIRED' });
    expect(sender.sent).toHaveLength(0);
    expect(h.approvals.byIdOrThrow(approvalId).state).toBe('EXPIRED');
  });

  it('laesst ueberfaellige Freigaben verfallen', async () => {
    const draft = h.engine.createDraft(DRAFT);
    const { approval, script } = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);
    h.engine.markReadBackComplete(approval.id, script.full);
    h.clock.advanceSeconds(200);

    expect(h.engine.expireOverdue()).toBe(1);
    expect(h.approvals.byIdOrThrow(approval.id).state).toBe('EXPIRED');
  });

  it('sendet noch, wenn die Frist knapp eingehalten wird', async () => {
    const { approvalId } = await runHappyPath();
    h.clock.advanceSeconds(179);

    const r = await h.engine.execute(approvalId);
    expect(r.status).toBe('sent');
    expect(sender.sent).toHaveLength(1);
  });
});

describe('Approval Engine - Inhaltsaenderung macht die Freigabe ungueltig', () => {
  it('nach Textaenderung ist kein Versand moeglich', async () => {
    const draft = h.engine.createDraft(DRAFT);
    const { approval, script } = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);
    h.engine.markReadBackComplete(approval.id, script.full);
    h.engine.awaitApproval(approval.id);
    h.engine.confirmVoice(approval.id, 'Ja, senden');
    await h.engine.confirmPin(approval.id, TEST_APPROVAL_PIN);

    h.engine.reviseDraft(draft.id, { body: `${DRAFT.body} Nachtrag: bitte in bar.` });

    await expect(h.engine.execute(approval.id)).rejects.toBeInstanceOf(ApprovalError);
    expect(sender.sent).toHaveLength(0);
    expect(h.approvals.byIdOrThrow(approval.id).state).toBe('CANCELLED');
  });

  it.each([
    ['Empfaenger', { recipient: 'jemand.anderes@example.net' }],
    ['Betreff', { subject: 'Anderer Betreff' }],
    ['Thread', { threadId: 'thread-99' }],
    ['Anhang', { attachments: [{ name: 'angebot.pdf', mimeType: 'application/pdf', sizeBytes: 1234, ref: '/tmp/a.pdf' }] }],
  ])('Aenderung an %s macht die Freigabe ungueltig', async (_label, patch) => {
    const draft = h.engine.createDraft(DRAFT);
    const { approval, script } = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);
    h.engine.markReadBackComplete(approval.id, script.full);
    h.engine.awaitApproval(approval.id);
    h.engine.confirmVoice(approval.id, 'Ja, senden');
    await h.engine.confirmPin(approval.id, TEST_APPROVAL_PIN);

    h.engine.reviseDraft(draft.id, patch);

    await expect(h.engine.execute(approval.id)).rejects.toBeInstanceOf(ApprovalError);
    expect(sender.sent).toHaveLength(0);
  });

  it('verlangt nach einer Aenderung einen vollstaendig neuen Durchlauf', async () => {
    const draft = h.engine.createDraft(DRAFT);
    const first = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);
    h.engine.markReadBackComplete(first.approval.id, first.script.full);

    const revised = h.engine.reviseDraft(draft.id, { body: 'Kuerzere Antwort. Gruss Noah' });
    const second = h.engine.requestApproval(draft.id, CALL_ID_FIXTURE);

    // Der neue Read-back enthaelt den neuen Text - der alte passt nicht mehr.
    expect(second.script.full).toContain('Kuerzere Antwort');
    expect(() => h.engine.markReadBackComplete(second.approval.id, first.script.full)).toThrow(
      ApprovalError,
    );

    h.engine.markReadBackComplete(second.approval.id, buildReadBack(revised).full);
    h.engine.awaitApproval(second.approval.id);
    h.engine.confirmVoice(second.approval.id, 'Ja, senden');
    await h.engine.confirmPin(second.approval.id, TEST_APPROVAL_PIN);
    await h.engine.execute(second.approval.id);

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.draft.body).toContain('Kuerzere Antwort');
  });
});

describe('Approval Engine - Einmaligkeit', () => {
  it('eine benutzte Freigabe kann kein zweites Mal verwendet werden', async () => {
    const { approvalId } = await runHappyPath();
    await h.engine.execute(approvalId);

    await expect(h.engine.execute(approvalId)).rejects.toMatchObject({ code: 'ALREADY_CONSUMED' });
    expect(sender.sent).toHaveLength(1);
  });

  it('zwei parallele Versandversuche erzeugen genau eine Nachricht', async () => {
    const { approvalId } = await runHappyPath();

    const results = await Promise.allSettled([
      h.engine.execute(approvalId),
      h.engine.execute(approvalId),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');

    expect(fulfilled).toHaveLength(1);
    expect(sender.sent).toHaveLength(1);
  });

  it('ein Provider-Retry erzeugt keine zweite Nachricht', async () => {
    sender.failuresBeforeSuccess = 1;

    const first = await runHappyPath();
    const failed = await h.engine.execute(first.approvalId);
    expect(failed.status).toBe('failed');
    expect(sender.sent).toHaveLength(0);

    // Neuer Anlauf mit unveraendertem Inhalt: neuer Freigabedurchlauf,
    // aber der Provider sieht denselben Inhalt und darf nur einmal zustellen.
    const second = await runHappyPath();
    const ok = await h.engine.execute(second.approvalId);
    expect(ok.status).toBe('sent');
    expect(sender.sent).toHaveLength(1);
  });

  it('ein Absturz nach erfolgreichem Provideraufruf sendet nicht erneut', async () => {
    const { approvalId } = await runHappyPath();
    await h.engine.execute(approvalId);
    expect(sender.callCount).toBe(1);

    // Zustand kuenstlich zurueckdrehen, als waere der Prozess mitten im
    // Abschluss gestorben - der Sendevorgang steht aber schon auf SUCCEEDED.
    h.db.run(`UPDATE approvals SET state = 'APPROVED', consumed = 0 WHERE id = ?`, [approvalId]);

    const again = await h.engine.execute(approvalId);
    expect(again.status).toBe('sent');
    expect(sender.callCount).toBe(1);
    expect(sender.sent).toHaveLength(1);
  });
});

describe('Approval Engine - Providerfehler werden nie als Erfolg dargestellt', () => {
  it('meldet bei Fehler ausdruecklich, dass nichts gesendet wurde', async () => {
    sender.behaviour = 'fail';
    const { approvalId } = await runHappyPath();

    const r = await h.engine.execute(approvalId);
    expect(r.status).toBe('failed');
    expect(r.spokenDe).toContain('nichts gesendet');
    expect(r.providerMessageId).toBeNull();
  });

  it('meldet eine unklare Providerantwort als unklar, nicht als Erfolg', async () => {
    sender.behaviour = 'timeout';
    const { approvalId } = await runHappyPath();

    const r = await h.engine.execute(approvalId);
    expect(r.status).toBe('unknown');
    expect(r.spokenDe).toContain('keine belastbare Bestaetigung');
    expect(h.approvals.byIdOrThrow(approvalId).state).toBe('UNKNOWN');
  });

  it('behandelt einen geworfenen Netzwerkfehler als unklar, nicht als Erfolg', async () => {
    sender.behaviour = 'throw';
    const { approvalId } = await runHappyPath();

    const r = await h.engine.execute(approvalId);
    expect(r.status).toBe('unknown');
    expect(sender.sent).toHaveLength(0);
  });
});

describe('Approval Engine - Abbruch', () => {
  it('nach cancel ist kein Versand moeglich', async () => {
    const { approvalId } = await runHappyPath();
    h.engine.cancel(approvalId, 'noah hat abgebrochen');

    await expect(h.engine.execute(approvalId)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(sender.sent).toHaveLength(0);
  });
});

describe('Approval Engine - Property-based', () => {
  it('kein Versand, wenn irgendeine Freigabestufe fehlt', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          readBack: fc.boolean(),
          await_: fc.boolean(),
          voice: fc.boolean(),
          pin: fc.boolean(),
        }),
        async (steps) => {
          const local = await createHarness();
          const localSender = local.recordingSenders.get('email');
          if (localSender === undefined) throw new Error('Testaufbau fehlerhaft');

          const draft = local.engine.createDraft(DRAFT);
          const { approval, script } = local.engine.requestApproval(draft.id, CALL_ID_FIXTURE);

          try {
            if (steps.readBack) local.engine.markReadBackComplete(approval.id, script.full);
            if (steps.await_) local.engine.awaitApproval(approval.id);
            if (steps.voice) local.engine.confirmVoice(approval.id, 'Ja, senden');
            if (steps.pin) await local.engine.confirmPin(approval.id, TEST_APPROVAL_PIN);
            await local.engine.execute(approval.id);
          } catch {
            /* Fehler sind hier der Normalfall */
          }

          const allDone = steps.readBack && steps.await_ && steps.voice && steps.pin;
          const sentCount = localSender.sent.length;
          await local.close();

          // Nur der vollstaendige Pfad darf senden, und dann genau einmal.
          return allDone ? sentCount === 1 : sentCount === 0;
        },
      ),
      { numRuns: 40 },
    );
  });

  it('jede Inhaltsaenderung aendert den Hash', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        (a, b) => {
          fc.pre(a.trim() !== b.trim());
          fc.pre(a.trim().length > 0 && b.trim().length > 0);
          const base = { ...DRAFT, attachments: [] as never[] };
          const h1 = canonicalizeDraft({ ...base, body: a });
          const h2 = canonicalizeDraft({ ...base, body: b });
          return h1 !== h2;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Inhalt laesst sich nicht zwischen Betreff und Text verschieben', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), fc.string({ minLength: 1, maxLength: 60 }), (s, b) => {
        fc.pre(s.trim().length > 0 && b.trim().length > 0);
        const base = { ...DRAFT, attachments: [] as never[] };
        const split = canonicalizeDraft({ ...base, subject: s, body: b });
        const merged = canonicalizeDraft({ ...base, subject: '', body: s + b });
        return split !== merged;
      }),
      { numRuns: 200 },
    );
  });

  it('eine gueltige Sprachbestaetigung enthaelt immer ein Sendeverb', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        if (!isValidVoiceConfirmation(s)) return true;
        return /senden|abschicken/i.test(s);
      }),
      { numRuns: 500 },
    );
  });
});

describe('Approval Engine - Audit-Kette', () => {
  it('erkennt eine nachtraegliche Manipulation', async () => {
    const { approvalId } = await runHappyPath();
    await h.engine.execute(approvalId);
    await h.audit.flush();

    expect(await h.audit.verify()).toEqual({ ok: true });

    // Ein Eintrag wird nachtraeglich umgeschrieben, als haette jemand einen
    // fehlgeschlagenen Versand zum Erfolg erklaert.
    h.db.run(`UPDATE audit_log SET action = 'send.succeeded' WHERE seq = 1`);

    const res = verifyChain(readAuditChain(h));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.brokenAtSeq).toBe(1);
  });

  it('erkennt eine herausgeloeschte Zeile', async () => {
    const { approvalId } = await runHappyPath();
    await h.engine.execute(approvalId);
    await h.audit.flush();

    h.db.run('DELETE FROM audit_log WHERE seq = 2');

    expect(verifyChain(readAuditChain(h)).ok).toBe(false);
  });
});

function auditActions(harness: Harness): string[] {
  return harness.db
    .all<{ action: string }>('SELECT action FROM audit_log ORDER BY seq ASC')
    .map((r) => r.action);
}

interface AuditRow {
  seq: number;
  at: string;
  action: string;
  subject: string;
  details: string;
  prev_hash: string;
  hash: string;
}

function readAuditChain(harness: Harness): AuditEntry[] {
  return harness.db
    .all<AuditRow>('SELECT * FROM audit_log ORDER BY seq ASC')
    .map((r) => ({
      seq: r.seq,
      at: r.at,
      action: r.action as AuditEntry['action'],
      subject: r.subject,
      details: JSON.parse(r.details) as Record<string, unknown>,
      prevHash: r.prev_hash,
      hash: r.hash,
    }));
}
