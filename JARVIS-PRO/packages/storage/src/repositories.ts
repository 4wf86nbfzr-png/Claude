import {
  type Approval,
  type ApprovalId,
  type ApprovalState,
  type CalendarEventDraft,
  type Call,
  type CallDirection,
  type CallEndReason,
  type CallId,
  type CallState,
  type Channel,
  type Clock,
  type E164,
  type EventId,
  type IdGenerator,
  type MemoryDraft,
  type MemoryEntry,
  type MemoryId,
  type MemorySensitivity,
  type OutboundAttachment,
  type OutboundDraft,
  type OutboundDraftInput,
  type DraftId,
  type OpenTask,
  type TaskId,
  type TaskState,
  calendarIdempotencyKey,
} from '@jarvis/domain';
import type { AuditEntry, AuditSink } from '@jarvis/security';
import type { Db } from './db.js';

/* -------------------------------------------------------------------------- */
/* Entwuerfe                                                                   */
/* -------------------------------------------------------------------------- */

interface DraftRow {
  id: string;
  channel: string;
  provider_account: string;
  recipient: string;
  subject: string | null;
  body: string;
  attachments_json: string;
  thread_id: string | null;
  in_reply_to_event_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export class DraftRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  create(input: OutboundDraftInput): OutboundDraft {
    const id = this.ids.next('drf') as DraftId;
    const now = this.clock.nowIso();
    this.db.run(
      `INSERT INTO drafts (id, channel, provider_account, recipient, subject, body,
                           attachments_json, thread_id, in_reply_to_event_id, revision, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`,
      [
        id,
        input.channel,
        input.providerAccount,
        input.recipient,
        input.subject,
        input.body,
        JSON.stringify(input.attachments),
        input.threadId,
        input.inReplyToEventId,
        now,
        now,
      ],
    );
    return this.byIdOrThrow(id);
  }

  /** Ueberarbeitung. Die Revision steigt - jede bestehende Freigabe wird dadurch ungueltig. */
  revise(
    id: DraftId,
    patch: Partial<Pick<OutboundDraftInput, 'recipient' | 'subject' | 'body' | 'attachments' | 'threadId'>>,
  ): OutboundDraft {
    const cur = this.byIdOrThrow(id);
    this.db.run(
      `UPDATE drafts SET recipient = ?, subject = ?, body = ?, attachments_json = ?,
                         thread_id = ?, revision = revision + 1, updated_at = ? WHERE id = ?`,
      [
        patch.recipient ?? cur.recipient,
        patch.subject === undefined ? cur.subject : patch.subject,
        patch.body ?? cur.body,
        JSON.stringify(patch.attachments ?? cur.attachments),
        patch.threadId === undefined ? cur.threadId : patch.threadId,
        this.clock.nowIso(),
        id,
      ],
    );
    return this.byIdOrThrow(id);
  }

  byId(id: DraftId): OutboundDraft | null {
    const r = this.db.get<DraftRow>('SELECT * FROM drafts WHERE id = ?', [id]);
    return r === undefined ? null : rowToDraft(r);
  }

  byIdOrThrow(id: DraftId): OutboundDraft {
    const d = this.byId(id);
    if (d === null) throw new Error(`Entwurf ${id} nicht gefunden`);
    return d;
  }

  delete(id: DraftId): boolean {
    return this.db.run('DELETE FROM drafts WHERE id = ?', [id]).changes > 0;
  }
}

function rowToDraft(r: DraftRow): OutboundDraft {
  return {
    id: r.id as DraftId,
    channel: r.channel as Channel,
    providerAccount: r.provider_account,
    recipient: r.recipient,
    subject: r.subject,
    body: r.body,
    attachments: JSON.parse(r.attachments_json) as OutboundAttachment[],
    threadId: r.thread_id,
    inReplyToEventId: r.in_reply_to_event_id as EventId | null,
    createdAt: r.created_at,
    revision: r.revision,
  };
}

/* -------------------------------------------------------------------------- */
/* Freigaben                                                                   */
/* -------------------------------------------------------------------------- */

interface ApprovalRow {
  id: string;
  draft_id: string;
  call_id: string;
  state: string;
  payload_hash: string;
  read_back_at: string | null;
  read_back_hash: string | null;
  voice_confirmed_at: string | null;
  pin_verified_at: string | null;
  approved_at: string | null;
  expires_at: string;
  consumed: number;
  provider_message_id: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export class ApprovalRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  create(input: {
    draftId: DraftId;
    callId: CallId;
    payloadHash: string;
    expiresAt: string;
  }): Approval {
    const id = this.ids.next('apr') as ApprovalId;
    const now = this.clock.nowIso();
    this.db.run(
      `INSERT INTO approvals (id, draft_id, call_id, state, payload_hash, expires_at,
                              consumed, created_at, updated_at)
       VALUES (?,?,?,'DRAFT',?,?,0,?,?)`,
      [id, input.draftId, input.callId, input.payloadHash, input.expiresAt, now, now],
    );
    return this.byIdOrThrow(id);
  }

  /**
   * Schreibt ein Update. `expectedState` macht daraus ein Compare-and-Swap:
   * hat ein anderer Vorgang den Zustand inzwischen veraendert, schlaegt das
   * Update fehl, statt ihn zu ueberschreiben.
   */
  update(
    id: ApprovalId,
    expectedState: ApprovalState,
    patch: Partial<{
      state: ApprovalState;
      readBackAt: string | null;
      readBackHash: string | null;
      voiceConfirmedAt: string | null;
      pinVerifiedAt: string | null;
      approvedAt: string | null;
      consumed: boolean;
      providerMessageId: string | null;
      failureReason: string | null;
    }>,
  ): Approval | null {
    return this.db.transaction(() => {
      const cur = this.db.get<ApprovalRow>('SELECT * FROM approvals WHERE id = ?', [id]);
      if (cur === undefined || cur.state !== expectedState) return null;
      const next = {
        state: patch.state ?? (cur.state),
        read_back_at: patch.readBackAt === undefined ? cur.read_back_at : patch.readBackAt,
        read_back_hash: patch.readBackHash === undefined ? cur.read_back_hash : patch.readBackHash,
        voice_confirmed_at:
          patch.voiceConfirmedAt === undefined ? cur.voice_confirmed_at : patch.voiceConfirmedAt,
        pin_verified_at: patch.pinVerifiedAt === undefined ? cur.pin_verified_at : patch.pinVerifiedAt,
        approved_at: patch.approvedAt === undefined ? cur.approved_at : patch.approvedAt,
        consumed: patch.consumed === undefined ? cur.consumed : patch.consumed ? 1 : 0,
        provider_message_id:
          patch.providerMessageId === undefined ? cur.provider_message_id : patch.providerMessageId,
        failure_reason: patch.failureReason === undefined ? cur.failure_reason : patch.failureReason,
      };
      const res = this.db.run(
        `UPDATE approvals SET state=?, read_back_at=?, read_back_hash=?, voice_confirmed_at=?,
                              pin_verified_at=?, approved_at=?, consumed=?, provider_message_id=?,
                              failure_reason=?, updated_at=?
          WHERE id = ? AND state = ?`,
        [
          next.state,
          next.read_back_at,
          next.read_back_hash,
          next.voice_confirmed_at,
          next.pin_verified_at,
          next.approved_at,
          next.consumed,
          next.provider_message_id,
          next.failure_reason,
          this.clock.nowIso(),
          id,
          expectedState,
        ],
      );
      if (res.changes === 0) return null;
      return this.byIdOrThrow(id);
    });
  }

  byId(id: ApprovalId): Approval | null {
    const r = this.db.get<ApprovalRow>('SELECT * FROM approvals WHERE id = ?', [id]);
    return r === undefined ? null : rowToApproval(r);
  }

  byIdOrThrow(id: ApprovalId): Approval {
    const a = this.byId(id);
    if (a === null) throw new Error(`Freigabe ${id} nicht gefunden`);
    return a;
  }

  liveForDraft(draftId: DraftId): Approval | null {
    const r = this.db.get<ApprovalRow>(
      `SELECT * FROM approvals WHERE draft_id = ?
        AND state IN ('DRAFT','READ_BACK','AWAITING_APPROVAL','APPROVED','SENDING')`,
      [draftId],
    );
    return r === undefined ? null : rowToApproval(r);
  }

  /**
   * Die laufende Freigabe eines Gespraechs.
   *
   * Am Telefon braucht es das nicht - dort haelt der Gespraechsablauf den
   * Vorgang im Speicher, solange der Anruf laeuft. Im Chat gibt es keinen
   * laufenden Prozess: jede Nachricht ist eine eigene HTTP-Anfrage. Der
   * Zustand muss deshalb aus der Datenbank kommen, nicht aus dem Speicher -
   * sonst waere eine begonnene Freigabe nach einem Neustart verloren, oder
   * schlimmer: halb vorhanden.
   */
  liveForCall(callId: CallId): Approval | null {
    const r = this.db.get<ApprovalRow>(
      `SELECT * FROM approvals WHERE call_id = ?
        AND state IN ('DRAFT','READ_BACK','AWAITING_APPROVAL','APPROVED','SENDING')
        ORDER BY created_at DESC LIMIT 1`,
      [callId],
    );
    return r === undefined ? null : rowToApproval(r);
  }

  /** Alle Freigaben, deren Frist abgelaufen ist und die noch offen sind. */
  findExpired(nowIso: string): Approval[] {
    return this.db
      .all<ApprovalRow>(
        `SELECT * FROM approvals WHERE expires_at <= ?
          AND state IN ('DRAFT','READ_BACK','AWAITING_APPROVAL','APPROVED')`,
        [nowIso],
      )
      .map(rowToApproval);
  }
}

function rowToApproval(r: ApprovalRow): Approval {
  return {
    id: r.id as ApprovalId,
    draftId: r.draft_id as DraftId,
    callId: r.call_id as CallId,
    state: r.state as ApprovalState,
    payloadHash: r.payload_hash,
    readBackAt: r.read_back_at,
    readBackHash: r.read_back_hash,
    voiceConfirmedAt: r.voice_confirmed_at,
    pinVerifiedAt: r.pin_verified_at,
    approvedAt: r.approved_at,
    expiresAt: r.expires_at,
    consumed: r.consumed === 1,
    providerMessageId: r.provider_message_id,
    failureReason: r.failure_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Sendevorgaenge                                                              */
/* -------------------------------------------------------------------------- */

export type SendState = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export interface SendRecord {
  readonly id: string;
  readonly approvalId: ApprovalId;
  readonly idempotencyKey: string;
  readonly channel: Channel;
  readonly state: SendState;
  readonly providerMessageId: string | null;
  readonly error: string | null;
}

interface SendRow {
  id: string;
  approval_id: string;
  idempotency_key: string;
  channel: string;
  state: string;
  provider_message_id: string | null;
  error: string | null;
}

/**
 * Sendevorgaenge. `approval_id` und `idempotency_key` sind beide UNIQUE:
 * eine Freigabe kann hoechstens einen Sendevorgang erzeugen, und ein Retry
 * mit demselben Schluessel findet den bestehenden Datensatz vor, statt ein
 * zweites Mal zu senden.
 */
export class SendRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** Legt den Vorgang an oder gibt den bestehenden zurueck (`isNew=false`). */
  begin(approvalId: ApprovalId, idempotencyKey: string, channel: Channel): { record: SendRecord; isNew: boolean } {
    return this.db.transaction(() => {
      const existing = this.db.get<SendRow>('SELECT * FROM sends WHERE idempotency_key = ?', [
        idempotencyKey,
      ]);
      if (existing !== undefined) return { record: rowToSend(existing), isNew: false };
      const id = this.ids.next('snd');
      const now = this.clock.nowIso();
      this.db.run(
        `INSERT INTO sends (id, approval_id, idempotency_key, channel, state, created_at, updated_at)
         VALUES (?,?,?,?,'PENDING',?,?)`,
        [id, approvalId, idempotencyKey, channel, now, now],
      );
      return { record: this.byIdOrThrow(id), isNew: true };
    });
  }

  finish(id: string, state: SendState, providerMessageId: string | null, error: string | null): SendRecord {
    this.db.run(
      `UPDATE sends SET state = ?, provider_message_id = ?, error = ?, updated_at = ? WHERE id = ?`,
      [state, providerMessageId, error, this.clock.nowIso(), id],
    );
    return this.byIdOrThrow(id);
  }

  byIdOrThrow(id: string): SendRecord {
    const r = this.db.get<SendRow>('SELECT * FROM sends WHERE id = ?', [id]);
    if (r === undefined) throw new Error(`Sendevorgang ${id} nicht gefunden`);
    return rowToSend(r);
  }

  byIdempotencyKey(key: string): SendRecord | null {
    const r = this.db.get<SendRow>('SELECT * FROM sends WHERE idempotency_key = ?', [key]);
    return r === undefined ? null : rowToSend(r);
  }

  countSucceeded(): number {
    const r = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM sends WHERE state = 'SUCCEEDED'`);
    return r?.n ?? 0;
  }

  all(): SendRecord[] {
    return this.db.all<SendRow>('SELECT * FROM sends ORDER BY created_at ASC').map(rowToSend);
  }
}

function rowToSend(r: SendRow): SendRecord {
  return {
    id: r.id,
    approvalId: r.approval_id as ApprovalId,
    idempotencyKey: r.idempotency_key,
    channel: r.channel as Channel,
    state: r.state as SendState,
    providerMessageId: r.provider_message_id,
    error: r.error,
  };
}

/* -------------------------------------------------------------------------- */
/* Aufgaben und Gedaechtnis                                                    */
/* -------------------------------------------------------------------------- */

interface TaskRow {
  id: string;
  title: string;
  state: string;
  due_at: string | null;
  origin_ref: string;
  origin_event_id: string | null;
  next_step: string;
  created_at: string;
  updated_at: string;
}

export class TaskRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  create(input: {
    title: string;
    dueAt?: string | null;
    originRef: string;
    originEventId?: EventId | null;
    nextStep?: string;
  }): OpenTask {
    const id = this.ids.next('tsk') as TaskId;
    const now = this.clock.nowIso();
    this.db.run(
      `INSERT INTO tasks (id, title, state, due_at, origin_ref, origin_event_id, next_step, created_at, updated_at)
       VALUES (?,?,'open',?,?,?,?,?,?)`,
      [id, input.title, input.dueAt ?? null, input.originRef, input.originEventId ?? null, input.nextStep ?? '', now, now],
    );
    return this.byIdOrThrow(id);
  }

  setState(id: TaskId, state: TaskState, nextStep?: string): OpenTask | null {
    this.db.run(
      `UPDATE tasks SET state = ?, next_step = COALESCE(?, next_step), updated_at = ? WHERE id = ?`,
      [state, nextStep ?? null, this.clock.nowIso(), id],
    );
    return this.byId(id);
  }

  byId(id: TaskId): OpenTask | null {
    const r = this.db.get<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
    return r === undefined ? null : rowToTask(r);
  }

  byIdOrThrow(id: TaskId): OpenTask {
    const t = this.byId(id);
    if (t === null) throw new Error(`Aufgabe ${id} nicht gefunden`);
    return t;
  }

  open(limit = 50): OpenTask[] {
    return this.db
      .all<TaskRow>(
        `SELECT * FROM tasks WHERE state IN ('open','in_progress','waiting')
          ORDER BY (due_at IS NULL), due_at ASC, created_at ASC LIMIT ?`,
        [limit],
      )
      .map(rowToTask);
  }

  all(): OpenTask[] {
    return this.db.all<TaskRow>('SELECT * FROM tasks ORDER BY created_at ASC').map(rowToTask);
  }
}

function rowToTask(r: TaskRow): OpenTask {
  return {
    id: r.id as TaskId,
    title: r.title,
    state: r.state as TaskState,
    dueAt: r.due_at,
    originRef: r.origin_ref,
    originEventId: r.origin_event_id as EventId | null,
    nextStep: r.next_step,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface MemoryRow {
  id: string;
  subject: string;
  fact: string;
  sensitivity: string;
  confirmed_at: string;
  confirmation_utterance: string;
  source_ref: string;
  created_at: string;
  updated_at: string;
}

export class MemoryRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  store(draft: MemoryDraft, confirmationUtterance: string): MemoryEntry {
    const id = this.ids.next('mem') as MemoryId;
    const now = this.clock.nowIso();
    this.db.run(
      `INSERT INTO memories (id, subject, fact, sensitivity, confirmed_at,
                             confirmation_utterance, source_ref, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, draft.subject, draft.fact, draft.sensitivity, now, confirmationUtterance, draft.sourceRef, now, now],
    );
    return this.byIdOrThrow(id);
  }

  update(id: MemoryId, fact: string, confirmationUtterance: string): MemoryEntry | null {
    const changed = this.db.run(
      `UPDATE memories SET fact = ?, confirmation_utterance = ?, confirmed_at = ?, updated_at = ? WHERE id = ?`,
      [fact, confirmationUtterance, this.clock.nowIso(), this.clock.nowIso(), id],
    ).changes;
    return changed > 0 ? this.byIdOrThrow(id) : null;
  }

  delete(id: MemoryId): boolean {
    return this.db.run('DELETE FROM memories WHERE id = ?', [id]).changes > 0;
  }

  byId(id: MemoryId): MemoryEntry | null {
    const r = this.db.get<MemoryRow>('SELECT * FROM memories WHERE id = ?', [id]);
    return r === undefined ? null : rowToMemory(r);
  }

  byIdOrThrow(id: MemoryId): MemoryEntry {
    const m = this.byId(id);
    if (m === null) throw new Error(`Erinnerung ${id} nicht gefunden`);
    return m;
  }

  search(term: string, limit = 20): MemoryEntry[] {
    const like = `%${term.toLowerCase()}%`;
    return this.db
      .all<MemoryRow>(
        `SELECT * FROM memories WHERE lower(subject) LIKE ? OR lower(fact) LIKE ?
          ORDER BY updated_at DESC LIMIT ?`,
        [like, like, limit],
      )
      .map(rowToMemory);
  }

  all(): MemoryEntry[] {
    return this.db.all<MemoryRow>('SELECT * FROM memories ORDER BY created_at ASC').map(rowToMemory);
  }
}

function rowToMemory(r: MemoryRow): MemoryEntry {
  return {
    id: r.id as MemoryId,
    subject: r.subject,
    fact: r.fact,
    sensitivity: r.sensitivity as MemorySensitivity,
    confirmedAt: r.confirmed_at,
    confirmationUtterance: r.confirmation_utterance,
    sourceRef: r.source_ref,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Anrufe                                                                      */
/* -------------------------------------------------------------------------- */

interface CallRow {
  id: string;
  direction: string;
  peer: string;
  state: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  announced_event_ids: string;
}

export class CallRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  start(direction: CallDirection, peer: E164): Call {
    const id = this.ids.next('cal') as CallId;
    this.db.run(
      `INSERT INTO calls (id, direction, peer, state, started_at, announced_event_ids)
       VALUES (?,?,?,?,?,'[]')`,
      [id, direction, peer, direction === 'outbound' ? 'DIALING' : 'IDLE', this.clock.nowIso()],
    );
    return this.byIdOrThrow(id);
  }

  setState(id: CallId, state: CallState): void {
    const patch: [string, string][] = [];
    if (state === 'ANSWERED') patch.push(['answered_at', this.clock.nowIso()]);
    this.db.run('UPDATE calls SET state = ? WHERE id = ?', [state, id]);
    for (const [col, val] of patch) {
      this.db.run(`UPDATE calls SET ${col} = COALESCE(${col}, ?) WHERE id = ?`, [val, id]);
    }
  }

  end(id: CallId, reason: CallEndReason): void {
    this.db.run(`UPDATE calls SET state = 'ENDED', ended_at = ?, end_reason = ? WHERE id = ?`, [
      this.clock.nowIso(),
      reason,
      id,
    ]);
  }

  addAnnounced(id: CallId, eventId: EventId): void {
    const c = this.byIdOrThrow(id);
    if (c.announcedEventIds.includes(eventId)) return;
    this.db.run('UPDATE calls SET announced_event_ids = ? WHERE id = ?', [
      JSON.stringify([...c.announcedEventIds, eventId]),
      id,
    ]);
  }

  byId(id: CallId): Call | null {
    const r = this.db.get<CallRow>('SELECT * FROM calls WHERE id = ?', [id]);
    return r === undefined ? null : rowToCall(r);
  }

  byIdOrThrow(id: CallId): Call {
    const c = this.byId(id);
    if (c === null) throw new Error(`Anruf ${id} nicht gefunden`);
    return c;
  }

  /** Es darf nie ein zweiter Anruf parallel laufen. */
  activeCall(): Call | null {
    const r = this.db.get<CallRow>(`SELECT * FROM calls WHERE state != 'ENDED' ORDER BY started_at DESC LIMIT 1`);
    return r === undefined ? null : rowToCall(r);
  }

  /** Anzahl gestarteter ausgehender Anrufe seit einem Zeitpunkt - fuer CALL_MAX_PER_HOUR. */
  countOutboundSince(sinceIso: string): number {
    const r = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM calls WHERE direction = 'outbound' AND started_at >= ?`,
      [sinceIso],
    );
    return r?.n ?? 0;
  }

  all(): Call[] {
    return this.db.all<CallRow>('SELECT * FROM calls ORDER BY started_at ASC').map(rowToCall);
  }
}

function rowToCall(r: CallRow): Call {
  return {
    id: r.id as CallId,
    direction: r.direction as CallDirection,
    peer: r.peer,
    state: r.state as CallState,
    startedAt: r.started_at,
    answeredAt: r.answered_at,
    endedAt: r.ended_at,
    endReason: r.end_reason as CallEndReason | null,
    announcedEventIds: JSON.parse(r.announced_event_ids) as EventId[],
  };
}

/* -------------------------------------------------------------------------- */
/* Kalender-Idempotenz und Sync-Zustand                                        */
/* -------------------------------------------------------------------------- */

/**
 * Merkt sich, welcher Kalendereintrag zu welchem Idempotenzschluessel gehoert.
 * Ein zweiter Versuch mit denselben Angaben legt keinen zweiten Termin an,
 * sondern liefert die vorhandene Provider-ID zurueck.
 */
export class CalendarIdempotencyRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  lookup(draft: CalendarEventDraft, scope: string): string | null {
    const key = calendarIdempotencyKey(draft, scope);
    const r = this.db.get<{ provider_event_id: string }>(
      'SELECT provider_event_id FROM calendar_idempotency WHERE key = ?',
      [key],
    );
    return r?.provider_event_id ?? null;
  }

  remember(draft: CalendarEventDraft, scope: string, providerEventId: string, providerAccount: string): void {
    const key = calendarIdempotencyKey(draft, scope);
    this.db.run(
      `INSERT OR IGNORE INTO calendar_idempotency (key, provider_event_id, provider_account, created_at)
       VALUES (?,?,?,?)`,
      [key, providerEventId, providerAccount, this.clock.nowIso()],
    );
  }
}

export interface SyncState {
  readonly connector: string;
  readonly deltaLink: string | null;
  readonly historyId: string | null;
  readonly cursor: string | null;
  readonly updatedAt: string;
}

export class SyncStateRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  get(connector: string): SyncState | null {
    const r = this.db.get<{
      connector: string;
      delta_link: string | null;
      history_id: string | null;
      cursor: string | null;
      updated_at: string;
    }>('SELECT * FROM sync_state WHERE connector = ?', [connector]);
    return r === undefined
      ? null
      : {
          connector: r.connector,
          deltaLink: r.delta_link,
          historyId: r.history_id,
          cursor: r.cursor,
          updatedAt: r.updated_at,
        };
  }

  set(connector: string, patch: { deltaLink?: string | null; historyId?: string | null; cursor?: string | null }): void {
    const cur = this.get(connector);
    this.db.run(
      `INSERT INTO sync_state (connector, delta_link, history_id, cursor, updated_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(connector) DO UPDATE SET delta_link = excluded.delta_link,
         history_id = excluded.history_id, cursor = excluded.cursor, updated_at = excluded.updated_at`,
      [
        connector,
        patch.deltaLink === undefined ? (cur?.deltaLink ?? null) : patch.deltaLink,
        patch.historyId === undefined ? (cur?.historyId ?? null) : patch.historyId,
        patch.cursor === undefined ? (cur?.cursor ?? null) : patch.cursor,
        this.clock.nowIso(),
      ],
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Audit-Log in SQL                                                            */
/* -------------------------------------------------------------------------- */

export class SqlAuditSink implements AuditSink {
  constructor(private readonly db: Db) {}

  /** Lesen des Vorgaengers und Schreiben in einer Transaktion - sonst reisst die Kette. */
  async appendAtomic(build: (prev: AuditEntry | null) => AuditEntry): Promise<AuditEntry> {
    return this.db.transaction(() => {
      const prevRow = this.db.get<AuditLogRow>('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1');
      const entry = build(prevRow === undefined ? null : rowToAudit(prevRow));
      this.db.run(
        'INSERT INTO audit_log (seq, at, action, subject, details, prev_hash, hash) VALUES (?,?,?,?,?,?,?)',
        [entry.seq, entry.at, entry.action, entry.subject, JSON.stringify(entry.details), entry.prevHash, entry.hash],
      );
      return entry;
    });
  }

  async last(): Promise<AuditEntry | null> {
    const r = this.db.get<AuditLogRow>('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1');
    return r === undefined ? null : rowToAudit(r);
  }

  async all(): Promise<readonly AuditEntry[]> {
    return this.db.all<AuditLogRow>('SELECT * FROM audit_log ORDER BY seq ASC').map(rowToAudit);
  }
}

interface AuditLogRow {
  seq: number;
  at: string;
  action: string;
  subject: string;
  details: string;
  prev_hash: string;
  hash: string;
}

function rowToAudit(r: AuditLogRow): AuditEntry {
  return {
    seq: r.seq,
    at: r.at,
    action: r.action as AuditEntry['action'],
    subject: r.subject,
    details: JSON.parse(r.details) as Record<string, unknown>,
    prevHash: r.prev_hash,
    hash: r.hash,
  };
}
