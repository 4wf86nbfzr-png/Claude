import type { Database } from '../database.js';
import { nowIso } from '../../util/id.js';
import type { ApprovalAction, ApprovalRequest, ApprovalStatus } from './row-types.js';

interface ApprovalRow {
  id: number;
  action: string;
  title: string;
  facts: string;
  preview: string | null;
  subject: string;
  fingerprint: string;
  status: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_evidence: string | null;
  expires_at: string;
  consumed_at: string | null;
}

function toApproval(row: ApprovalRow): ApprovalRequest {
  let facts: Array<{ label: string; value: string }> = [];
  try {
    facts = JSON.parse(row.facts) as Array<{ label: string; value: string }>;
  } catch {
    facts = [];
  }
  return {
    id: row.id,
    action: row.action as ApprovalAction,
    title: row.title,
    facts,
    preview: row.preview ?? undefined,
    subject: row.subject,
    fingerprint: row.fingerprint,
    status: row.status as ApprovalStatus,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    decisionEvidence: row.decision_evidence,
    expiresAt: row.expires_at,
  };
}

export class ApprovalRepository {
  constructor(private readonly db: Database) {}

  create(input: {
    action: ApprovalAction;
    title: string;
    facts: Array<{ label: string; value: string }>;
    preview?: string;
    subject: string;
    fingerprint: string;
    expiresAt: string;
  }): ApprovalRequest {
    // A new request supersedes any older open request for the same subject.
    this.db
      .prepare("UPDATE approvals SET status = 'abgelaufen', decided_at = ? WHERE subject = ? AND status = 'offen'")
      .run(nowIso(), input.subject);

    const result = this.db
      .prepare(
        `INSERT INTO approvals (action, title, facts, preview, subject, fingerprint, status, requested_at, expires_at)
         VALUES (?,?,?,?,?,?, 'offen', ?, ?)`,
      )
      .run(
        input.action,
        input.title,
        JSON.stringify(input.facts),
        input.preview ?? null,
        input.subject,
        input.fingerprint,
        nowIso(),
        input.expiresAt,
      );
    return this.get(result.lastInsertRowid)!;
  }

  get(id: number): ApprovalRequest | null {
    const row = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get<ApprovalRow>(id);
    return row ? toApproval(row) : null;
  }

  openForSubject(subject: string): ApprovalRequest | null {
    const row = this.db
      .prepare("SELECT * FROM approvals WHERE subject = ? AND status = 'offen' ORDER BY id DESC LIMIT 1")
      .get<ApprovalRow>(subject);
    return row ? toApproval(row) : null;
  }

  /**
   * The most recent granted, still unspent approval for a subject.
   * `consumed_at IS NULL` is what makes an approval single-use.
   */
  latestGranted(subject: string): ApprovalRequest | null {
    const row = this.db
      .prepare(
        `SELECT * FROM approvals
          WHERE subject = ? AND status = 'freigegeben' AND consumed_at IS NULL
          ORDER BY decided_at DESC LIMIT 1`,
      )
      .get<ApprovalRow>(subject);
    return row ? toApproval(row) : null;
  }

  /**
   * Spends an approval. Returns false when it was already spent, which is what
   * stops a retry loop from sending the same mail twice.
   */
  consume(id: number): boolean {
    return (
      this.db
        .prepare(
          "UPDATE approvals SET consumed_at = ? WHERE id = ? AND status = 'freigegeben' AND consumed_at IS NULL",
        )
        .run(nowIso(), id).changes > 0
    );
  }

  listOpen(): ApprovalRequest[] {
    return this.db
      .prepare("SELECT * FROM approvals WHERE status = 'offen' ORDER BY requested_at")
      .all<ApprovalRow>()
      .map(toApproval);
  }

  list(limit = 100): ApprovalRequest[] {
    return this.db
      .prepare('SELECT * FROM approvals ORDER BY id DESC LIMIT ?')
      .all<ApprovalRow>(limit)
      .map(toApproval);
  }

  decide(id: number, status: 'freigegeben' | 'abgelehnt', evidence: string): ApprovalRequest | null {
    this.db
      .prepare(
        `UPDATE approvals SET status = ?, decided_at = ?, decided_by = 'benutzer', decision_evidence = ?
         WHERE id = ? AND status = 'offen'`,
      )
      .run(status, nowIso(), evidence.slice(0, 500), id);
    return this.get(id);
  }

  /** Marks everything past its expiry as expired. Called before every read. */
  expireStale(): number {
    return this.db
      .prepare("UPDATE approvals SET status = 'abgelaufen' WHERE status = 'offen' AND expires_at < ?")
      .run(nowIso()).changes;
  }
}
