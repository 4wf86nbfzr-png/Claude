import {
  assertTransition,
  canonicalizeDraft,
  isValidVoiceConfirmation,
  type Approval,
  type ApprovalId,
  type CallId,
  type Clock,
  type DraftId,
  type OutboundDraft,
  type OutboundDraftInput,
} from '@jarvis/domain';
import { AuditLog, sha256Hex, verifyPin } from '@jarvis/security';
import { metrics, type Logger } from '@jarvis/observability';
import type { ApprovalRepository, DraftRepository, SendRepository } from '@jarvis/storage';
import { ApprovalError } from './errors.js';
import { buildReadBack, type ReadBackScript } from './read-back.js';
import type { SenderRegistry, SendOutcome } from './sender-registry.js';

/**
 * Approval Engine - die Stelle, die Versand ohne Einmalfreigabe technisch
 * unmoeglich macht.
 *
 * Die Absicherung ruht auf fuenf Saeulen, die alle gleichzeitig halten muessen:
 *
 *  1. Zustandsautomat: DRAFT -> READ_BACK -> AWAITING_APPROVAL -> APPROVED
 *     -> SENDING -> SENT. Jeder Uebergang wird geprueft; es gibt keinen Weg
 *     an einem Schritt vorbei.
 *  2. Hash-Bindung: die Freigabe haengt am SHA-256 der kanonischen
 *     Entwurfsserialisierung. Aendert sich Empfaenger, Betreff, Text, Anhang
 *     oder Thread, passt der Hash nicht mehr - die Freigabe ist tot.
 *  3. Read-back-Bindung: zusaetzlich wird gehasht, was tatsaechlich vorgelesen
 *     wurde. Ein Versand ohne vorheriges vollstaendiges Vorlesen ist nicht
 *     moeglich.
 *  4. Zwei Faktoren: gesprochenes "Ja, senden" UND eine DTMF-Freigabe-PIN.
 *     Ein blosses "ja" oder Hintergrundsprache reicht nicht.
 *  5. Einmaligkeit: `consumed` wird im selben Compare-and-Swap gesetzt, mit
 *     dem der Zustand nach SENDING wechselt. Zwei parallele Versuche koennen
 *     nicht beide gewinnen.
 *
 * Das Sprachmodell hat auf diese Klasse keinen direkten Zugriff. Es sieht nur
 * die Tools `draft_*`, `revise_*`, `read_*`, `summarize_*`, `request_approval`
 * und `cancel_*`; `confirmVoice`, `confirmPin` und `execute` werden vom
 * Gespraechsablauf aufgerufen, nicht vom Modell.
 */
export interface ApprovalEngineConfig {
  readonly expiresSeconds: number;
  readonly approvalPinHash: string;
}

export interface ApprovalEngineDeps {
  readonly drafts: DraftRepository;
  readonly approvals: ApprovalRepository;
  readonly sends: SendRepository;
  readonly senders: SenderRegistry;
  readonly audit: AuditLog;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly config: ApprovalEngineConfig;
}

export interface ApprovalRequest {
  readonly approval: Approval;
  readonly script: ReadBackScript;
}

export interface SendResult {
  readonly status: 'sent' | 'failed' | 'unknown';
  readonly providerMessageId: string | null;
  readonly sentAt: string | null;
  /** Satz zum Vorlesen. Bei Misserfolg steht darin ausdruecklich, dass nichts gesendet wurde. */
  readonly spokenDe: string;
}

export class ApprovalEngine {
  constructor(private readonly deps: ApprovalEngineDeps) {}

  /* --------------------------------------------------------------------- */
  /* Entwurf                                                                */
  /* --------------------------------------------------------------------- */

  createDraft(input: OutboundDraftInput): OutboundDraft {
    const draft = this.deps.drafts.create(input);
    void this.deps.audit.record('draft.created', draft.id, {
      channel: draft.channel,
      hash: this.hashOf(draft),
    });
    return draft;
  }

  /**
   * Ueberarbeitet einen Entwurf. Eine laufende Freigabe wird dabei sofort
   * ungueltig - nicht erst beim Senden, sondern hier.
   */
  reviseDraft(
    id: DraftId,
    patch: Partial<Pick<OutboundDraftInput, 'recipient' | 'subject' | 'body' | 'attachments' | 'threadId'>>,
  ): OutboundDraft {
    const before = this.deps.drafts.byId(id);
    if (before === null) throw new ApprovalError('DRAFT_NOT_FOUND');
    const after = this.deps.drafts.revise(id, patch);
    this.invalidateLiveApproval(id, 'inhalt_geaendert');
    void this.deps.audit.record('draft.revised', id, {
      revision: after.revision,
      hashBefore: this.hashOf(before),
      hashAfter: this.hashOf(after),
    });
    return after;
  }

  getDraft(id: DraftId): OutboundDraft {
    const d = this.deps.drafts.byId(id);
    if (d === null) throw new ApprovalError('DRAFT_NOT_FOUND');
    return d;
  }

  /* --------------------------------------------------------------------- */
  /* Freigabe anfordern und vorlesen                                        */
  /* --------------------------------------------------------------------- */

  /**
   * Startet einen Freigabevorgang. Das ist alles, was das Sprachmodell
   * ausloesen kann - der Vorgang steht danach in DRAFT und wartet auf den
   * Read-back durch den Gespraechsablauf.
   */
  requestApproval(draftId: DraftId, callId: CallId): ApprovalRequest {
    const draft = this.getDraft(draftId);
    if (!this.deps.senders.has(draft.channel)) {
      throw new ApprovalError('SENDER_NOT_REGISTERED', draft.channel);
    }
    // Eine bereits laufende Freigabe fuer denselben Entwurf wird verworfen -
    // es darf immer nur genau eine geben.
    this.invalidateLiveApproval(draftId, 'neue_anforderung');

    const expiresAt = new Date(
      this.deps.clock.now().getTime() + this.deps.config.expiresSeconds * 1000,
    ).toISOString();
    const approval = this.deps.approvals.create({
      draftId,
      callId,
      payloadHash: this.hashOf(draft),
      expiresAt,
    });
    metrics.approvalsRequested.inc({ channel: draft.channel });
    return { approval, script: buildReadBack(draft) };
  }

  /**
   * Meldet, dass der Read-back vollstaendig vorgelesen wurde. Der Aufrufer
   * uebergibt den tatsaechlich gesprochenen Text - daraus entsteht der
   * `readBackHash`. Wer nur so tut, als haette er vorgelesen, erzeugt einen
   * anderen Hash und kommt nicht weiter.
   */
  markReadBackComplete(approvalId: ApprovalId, spokenText: string): Approval {
    const approval = this.load(approvalId);
    this.assertUsable(approval);
    assertTransition(approval.state, 'READ_BACK');

    const draft = this.getDraft(approval.draftId);
    this.assertContentUnchanged(approval, draft);

    const expected = buildReadBack(draft).full;
    if (normalizeSpoken(spokenText) !== normalizeSpoken(expected)) {
      throw new ApprovalError('READ_BACK_STALE', 'Vorgelesener Text weicht vom Entwurf ab');
    }

    const updated = this.deps.approvals.update(approvalId, approval.state, {
      state: 'READ_BACK',
      readBackAt: this.deps.clock.nowIso(),
      readBackHash: sha256Hex(normalizeSpoken(expected)),
    });
    if (updated === null) throw new ApprovalError('CONCURRENT_MODIFICATION');
    void this.deps.audit.record('approval.readback', approvalId, {
      draftId: draft.id,
      payloadHash: approval.payloadHash,
    });
    return updated;
  }

  /** Nach dem Vorlesen wird die Frage gestellt - danach wartet der Vorgang auf die Antwort. */
  awaitApproval(approvalId: ApprovalId): Approval {
    const approval = this.load(approvalId);
    this.assertUsable(approval);
    assertTransition(approval.state, 'AWAITING_APPROVAL');
    const updated = this.deps.approvals.update(approvalId, approval.state, {
      state: 'AWAITING_APPROVAL',
    });
    if (updated === null) throw new ApprovalError('CONCURRENT_MODIFICATION');
    return updated;
  }

  /* --------------------------------------------------------------------- */
  /* Bestaetigung                                                           */
  /* --------------------------------------------------------------------- */

  /**
   * Prueft die gesprochene Bestaetigung. Ungueltige Aeusserungen fuehren nicht
   * zum Abbruch des Vorgangs - Noah darf sich korrigieren -, aber sie bringen
   * ihn auch keinen Schritt weiter.
   */
  confirmVoice(approvalId: ApprovalId, utterance: string): { accepted: boolean; approval: Approval } {
    const approval = this.load(approvalId);
    this.assertUsable(approval);
    if (approval.state !== 'AWAITING_APPROVAL') {
      throw new ApprovalError('WRONG_STATE', `erwartet AWAITING_APPROVAL, ist ${approval.state}`);
    }
    if (approval.readBackAt === null) throw new ApprovalError('NO_READ_BACK');

    if (!isValidVoiceConfirmation(utterance)) {
      void this.deps.audit.record('approval.voice.rejected', approvalId, {
        utteranceLength: utterance.length,
      });
      return { accepted: false, approval };
    }
    const updated = this.deps.approvals.update(approvalId, 'AWAITING_APPROVAL', {
      voiceConfirmedAt: this.deps.clock.nowIso(),
    });
    if (updated === null) throw new ApprovalError('CONCURRENT_MODIFICATION');
    void this.deps.audit.record('approval.voice.ok', approvalId, {});
    return { accepted: true, approval: updated };
  }

  /**
   * Prueft die DTMF-Freigabe-PIN. Erst danach steht der Vorgang auf APPROVED.
   * Ohne vorherige gueltige Sprachbestaetigung wird die PIN gar nicht erst
   * geprueft - beide Faktoren sind Pflicht, in dieser Reihenfolge.
   */
  async confirmPin(approvalId: ApprovalId, digits: string | null): Promise<{ accepted: boolean; approval: Approval }> {
    const approval = this.load(approvalId);
    this.assertUsable(approval);
    if (approval.state !== 'AWAITING_APPROVAL') {
      throw new ApprovalError('WRONG_STATE', `erwartet AWAITING_APPROVAL, ist ${approval.state}`);
    }
    if (approval.readBackAt === null) throw new ApprovalError('NO_READ_BACK');
    if (approval.voiceConfirmedAt === null) throw new ApprovalError('VOICE_CONFIRMATION_INVALID');
    if (digits === null || digits.length === 0) throw new ApprovalError('PIN_MISSING');

    // Inhalt erneut pruefen: zwischen Sprachbestaetigung und PIN koennte
    // der Entwurf veraendert worden sein.
    const draft = this.getDraft(approval.draftId);
    this.assertContentUnchanged(approval, draft);

    const ok = await verifyPin(digits, this.deps.config.approvalPinHash);
    if (!ok) {
      void this.deps.audit.record('approval.pin.failed', approvalId, {});
      return { accepted: false, approval };
    }

    const now = this.deps.clock.nowIso();
    const updated = this.deps.approvals.update(approvalId, 'AWAITING_APPROVAL', {
      state: 'APPROVED',
      pinVerifiedAt: now,
      approvedAt: now,
    });
    if (updated === null) throw new ApprovalError('CONCURRENT_MODIFICATION');
    metrics.approvalsGranted.inc({ channel: draft.channel });
    void this.deps.audit.record('approval.pin.ok', approvalId, {});
    void this.deps.audit.record('approval.granted', approvalId, {
      draftId: draft.id,
      payloadHash: approval.payloadHash,
    });
    return { accepted: true, approval: updated };
  }

  /* --------------------------------------------------------------------- */
  /* Versand                                                                */
  /* --------------------------------------------------------------------- */

  /**
   * Fuehrt den Versand aus. Alle Bedingungen werden hier noch einmal geprueft -
   * diese Methode vertraut keinem vorherigen Schritt.
   */
  async execute(approvalId: ApprovalId): Promise<SendResult> {
    const approval = this.load(approvalId);

    if (approval.consumed) throw new ApprovalError('ALREADY_CONSUMED');
    if (approval.state === 'SENT') throw new ApprovalError('ALREADY_CONSUMED');
    if (approval.state === 'CANCELLED') throw new ApprovalError('CANCELLED');
    if (approval.state === 'EXPIRED') throw new ApprovalError('EXPIRED');
    if (approval.state !== 'APPROVED') {
      throw new ApprovalError('WRONG_STATE', `erwartet APPROVED, ist ${approval.state}`);
    }
    if (approval.readBackAt === null) throw new ApprovalError('NO_READ_BACK');
    if (approval.voiceConfirmedAt === null) throw new ApprovalError('VOICE_CONFIRMATION_INVALID');
    if (approval.pinVerifiedAt === null) throw new ApprovalError('PIN_MISSING');
    if (this.isExpired(approval)) {
      this.expire(approval.id);
      throw new ApprovalError('EXPIRED');
    }

    const draft = this.getDraft(approval.draftId);
    this.assertContentUnchanged(approval, draft);

    const sender = this.deps.senders.get(draft.channel);
    if (sender === null) throw new ApprovalError('SENDER_NOT_REGISTERED', draft.channel);

    // Einmaligkeit: `consumed` und der Zustandswechsel in einem
    // Compare-and-Swap. Ein zweiter paralleler Aufruf bekommt hier null.
    const claimed = this.deps.approvals.update(approvalId, 'APPROVED', {
      state: 'SENDING',
      consumed: true,
    });
    if (claimed === null) throw new ApprovalError('ALREADY_CONSUMED');

    // Idempotenzschluessel aus Freigabe-ID und Inhaltshash: ein Retry
    // desselben Vorgangs trifft denselben Schluessel, ein anderer Inhalt nicht.
    const idempotencyKey = sha256Hex(`${approval.id}|${approval.payloadHash}`);
    const { record, isNew } = this.deps.sends.begin(approval.id, idempotencyKey, draft.channel);

    if (!isNew && record.state === 'SUCCEEDED') {
      // Der Versand lief bereits durch (z. B. Absturz nach dem Provideraufruf).
      // Kein zweiter Aufruf beim Provider.
      this.deps.approvals.update(approvalId, 'SENDING', {
        state: 'SENT',
        providerMessageId: record.providerMessageId,
      });
      return this.successResult(record.providerMessageId, draft.recipient);
    }

    void this.deps.audit.record('send.attempted', approvalId, {
      channel: draft.channel,
      idempotencyKey,
    });

    let outcome: SendOutcome;
    try {
      outcome = await sender.send(draft, idempotencyKey);
    } catch (err) {
      outcome = {
        status: 'unknown',
        providerMessageId: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (outcome.status === 'sent' && outcome.providerMessageId !== null) {
      this.deps.sends.finish(record.id, 'SUCCEEDED', outcome.providerMessageId, null);
      this.deps.approvals.update(approvalId, 'SENDING', {
        state: 'SENT',
        providerMessageId: outcome.providerMessageId,
      });
      metrics.sendsExecuted.inc({ channel: draft.channel });
      void this.deps.audit.record('send.succeeded', approvalId, {
        channel: draft.channel,
        providerMessageId: outcome.providerMessageId,
      });
      return this.successResult(outcome.providerMessageId, draft.recipient);
    }

    if (outcome.status === 'failed') {
      this.deps.sends.finish(record.id, 'FAILED', null, outcome.error);
      this.deps.approvals.update(approvalId, 'SENDING', {
        state: 'FAILED',
        failureReason: outcome.error,
      });
      metrics.providerErrors.inc({ channel: draft.channel });
      void this.deps.audit.record('send.failed', approvalId, { channel: draft.channel });
      return {
        status: 'failed',
        providerMessageId: null,
        sentAt: null,
        spokenDe:
          'Der Versand ist fehlgeschlagen. Es wurde nichts gesendet. Soll ich es noch einmal versuchen?',
      };
    }

    // Unklare Providerantwort. Das wird ausdruecklich NICHT als Erfolg
    // dargestellt - und auch nicht als sicherer Misserfolg.
    this.deps.sends.finish(record.id, 'UNKNOWN', outcome.providerMessageId, outcome.error);
    this.deps.approvals.update(approvalId, 'SENDING', {
      state: 'UNKNOWN',
      failureReason: outcome.error,
      providerMessageId: outcome.providerMessageId,
    });
    metrics.providerErrors.inc({ channel: draft.channel });
    void this.deps.audit.record('send.unknown', approvalId, { channel: draft.channel });
    return {
      status: 'unknown',
      providerMessageId: outcome.providerMessageId,
      sentAt: null,
      spokenDe:
        'Ich habe die Nachricht an den Anbieter uebergeben, aber keine belastbare Bestaetigung bekommen. ' +
        'Ich weiss im Moment nicht sicher, ob sie angekommen ist. Bitte pruef das im Postfach, ' +
        'bevor wir es noch einmal versuchen.',
    };
  }

  /* --------------------------------------------------------------------- */
  /* Abbruch, Ablauf, Hilfsmittel                                           */
  /* --------------------------------------------------------------------- */

  cancel(approvalId: ApprovalId, reason = 'abbruch'): Approval | null {
    const approval = this.deps.approvals.byId(approvalId);
    if (approval === null) return null;
    if (approval.state === 'SENDING' || approval.state === 'SENT') return approval;
    const updated = this.deps.approvals.update(approvalId, approval.state, {
      state: 'CANCELLED',
      failureReason: reason,
    });
    if (updated !== null) void this.deps.audit.record('approval.cancelled', approvalId, { reason });
    return updated;
  }

  /** Laesst abgelaufene Freigaben verfallen. Wird vom Gespraechsablauf und periodisch aufgerufen. */
  expireOverdue(): number {
    const overdue = this.deps.approvals.findExpired(this.deps.clock.nowIso());
    let n = 0;
    for (const a of overdue) {
      if (this.expire(a.id)) n += 1;
    }
    return n;
  }

  private expire(id: ApprovalId): boolean {
    const a = this.deps.approvals.byId(id);
    if (a === null || a.state === 'SENDING' || a.state === 'SENT') return false;
    const updated = this.deps.approvals.update(id, a.state, { state: 'EXPIRED' });
    if (updated === null) return false;
    metrics.approvalsExpired.inc({});
    void this.deps.audit.record('approval.expired', id, {});
    return true;
  }

  private invalidateLiveApproval(draftId: DraftId, reason: string): void {
    const live = this.deps.approvals.liveForDraft(draftId);
    if (live === null) return;
    if (live.state === 'SENDING' || live.state === 'SENT') return;
    const updated = this.deps.approvals.update(live.id, live.state, {
      state: 'CANCELLED',
      failureReason: reason,
    });
    if (updated !== null) {
      void this.deps.audit.record('approval.invalidated', live.id, { reason });
      this.deps.logger.info('freigabe_ungueltig', { approvalId: live.id, reason });
    }
  }

  private load(id: ApprovalId): Approval {
    const a = this.deps.approvals.byId(id);
    if (a === null) throw new ApprovalError('APPROVAL_NOT_FOUND');
    return a;
  }

  private assertUsable(a: Approval): void {
    if (a.consumed) throw new ApprovalError('ALREADY_CONSUMED');
    if (a.state === 'CANCELLED') throw new ApprovalError('CANCELLED');
    if (a.state === 'SENT') throw new ApprovalError('ALREADY_CONSUMED');
    if (a.state === 'EXPIRED') throw new ApprovalError('EXPIRED');
    if (this.isExpired(a)) {
      this.expire(a.id);
      throw new ApprovalError('EXPIRED');
    }
  }

  private assertContentUnchanged(a: Approval, draft: OutboundDraft): void {
    if (this.hashOf(draft) !== a.payloadHash) {
      this.invalidateLiveApproval(draft.id, 'hash_abweichung');
      throw new ApprovalError('CONTENT_CHANGED');
    }
  }

  private isExpired(a: Approval): boolean {
    return Date.parse(a.expiresAt) <= this.deps.clock.now().getTime();
  }

  private successResult(providerMessageId: string | null, recipient: string): SendResult {
    const at = this.deps.clock.now();
    const time = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    }).format(at);
    return {
      status: 'sent',
      providerMessageId,
      sentAt: at.toISOString(),
      spokenDe: `Gesendet an ${recipient} um ${time} Uhr. Die Vorgangsnummer lautet ${providerMessageId ?? 'unbekannt'}.`,
    };
  }

  /** Der Inhaltshash. Genau dieser Wert bindet die Freigabe. */
  hashOf(draft: OutboundDraft): string {
    return sha256Hex(canonicalizeDraft(draft));
  }
}

/** Vergleichsnormalisierung des vorgelesenen Textes (Whitespace ist egal, Inhalt nicht). */
function normalizeSpoken(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}
