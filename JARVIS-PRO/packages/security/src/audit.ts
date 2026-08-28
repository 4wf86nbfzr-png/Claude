import { sha256Hex } from './crypto.js';
import { redact } from './redaction.js';
import type { Clock } from '@jarvis/domain';

/**
 * Manipulationserschwerendes Audit-Log als Hash-Kette.
 *
 * Jeder Eintrag bindet den Hash seines Vorgaengers. Wer einen Eintrag im
 * Nachhinein aendert oder herausloescht, bricht die Kette - `verifyChain()`
 * findet die Stelle. Das verhindert keine Manipulation durch jemanden mit
 * Vollzugriff, macht sie aber nachweisbar.
 */
export const AUDIT_ACTIONS = [
  'call.inbound.accepted',
  'call.inbound.rejected',
  'call.outbound.placed',
  'call.ended',
  'auth.pin.ok',
  'auth.pin.failed',
  'event.ingested',
  'event.duplicate',
  'draft.created',
  'draft.revised',
  'approval.readback',
  'approval.voice.ok',
  'approval.voice.rejected',
  'approval.pin.ok',
  'approval.pin.failed',
  'approval.granted',
  'approval.expired',
  'approval.cancelled',
  'approval.invalidated',
  'send.attempted',
  'send.succeeded',
  'send.failed',
  'send.unknown',
  'calendar.created',
  'calendar.updated',
  'calendar.cancelled',
  'memory.stored',
  'memory.updated',
  'memory.deleted',
  'injection.detected',
  'export.created',
  'config.changed',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  readonly seq: number;
  readonly at: string;
  readonly action: AuditAction;
  readonly subject: string;
  readonly details: Record<string, unknown>;
  readonly prevHash: string;
  readonly hash: string;
}

export const AUDIT_GENESIS = '0'.repeat(64);

export function computeAuditHash(e: Omit<AuditEntry, 'hash'>): string {
  const canonical = [
    `seq:${e.seq}`,
    `at:${e.at}`,
    `action:${e.action}`,
    `subject:${e.subject.length}:${e.subject}`,
    `details:${stableJson(e.details)}`,
    `prev:${e.prevHash}`,
  ].join('|');
  return sha256Hex(canonical);
}

/** Deterministische JSON-Serialisierung (Schluessel sortiert). */
export function stableJson(v: unknown): string {
  const walk = (x: unknown): unknown => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(walk);
    const o = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = walk(o[k]);
    return out;
  };
  return JSON.stringify(walk(v));
}

export interface AuditSink {
  append(entry: AuditEntry): Promise<void>;
  last(): Promise<AuditEntry | null>;
  all(): Promise<readonly AuditEntry[]>;
}

export class InMemoryAuditSink implements AuditSink {
  private readonly entries: AuditEntry[] = [];
  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
  async last(): Promise<AuditEntry | null> {
    return this.entries.at(-1) ?? null;
  }
  async all(): Promise<readonly AuditEntry[]> {
    return this.entries;
  }
}

export class AuditLog {
  constructor(
    private readonly sink: AuditSink,
    private readonly clock: Clock,
  ) {}

  /**
   * Schreibt einen Eintrag. `details` wird vor dem Speichern redigiert -
   * ins Audit-Log kommt nie ein Geheimnis und nie ein Nachrichtentext,
   * nur Hashes, IDs und Statuswerte.
   */
  async record(
    action: AuditAction,
    subject: string,
    details: Record<string, unknown> = {},
  ): Promise<AuditEntry> {
    const prev = await this.sink.last();
    const base = {
      seq: (prev?.seq ?? 0) + 1,
      at: this.clock.nowIso(),
      action,
      subject,
      details: redact(details) as Record<string, unknown>,
      prevHash: prev?.hash ?? AUDIT_GENESIS,
    };
    const entry: AuditEntry = { ...base, hash: computeAuditHash(base) };
    await this.sink.append(entry);
    return entry;
  }

  async verify(): Promise<{ ok: true } | { ok: false; brokenAtSeq: number; reason: string }> {
    return verifyChain(await this.sink.all());
  }
}

export function verifyChain(
  entries: readonly AuditEntry[],
): { ok: true } | { ok: false; brokenAtSeq: number; reason: string } {
  let prevHash = AUDIT_GENESIS;
  let expectedSeq = 1;
  for (const e of entries) {
    if (e.seq !== expectedSeq) {
      return { ok: false, brokenAtSeq: e.seq, reason: `Luecke: erwartet ${expectedSeq}` };
    }
    if (e.prevHash !== prevHash) {
      return { ok: false, brokenAtSeq: e.seq, reason: 'Vorgaengerhash passt nicht' };
    }
    const { hash, ...rest } = e;
    if (computeAuditHash(rest) !== hash) {
      return { ok: false, brokenAtSeq: e.seq, reason: 'Eintrag wurde veraendert' };
    }
    prevHash = hash;
    expectedSeq += 1;
  }
  return { ok: true };
}
