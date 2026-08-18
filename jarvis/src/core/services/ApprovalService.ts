import type {
  ApprovalAction,
  ApprovalRequest,
  Result,
} from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { ApprovalRepository } from '../db/repositories/approvals.js';
import type { AuditLogService } from './AuditLogService.js';
import { isoPlus } from '../util/id.js';

/**
 * Actions that may never happen without an explicit human decision (§11).
 * The list is a constant, not configuration — it cannot be relaxed at runtime.
 */
export const ALWAYS_APPROVAL_REQUIRED: readonly ApprovalAction[] = [
  'email.send',
  'email.send_bulk',
  'file.delete',
  'file.overwrite',
  'app.install',
  'system.settings',
  'payment',
  'account.modify',
  'data.publish',
  'form.submit',
  'message.external',
] as const;

export interface ApprovalSpec {
  action: ApprovalAction;
  title: string;
  facts: Array<{ label: string; value: string }>;
  preview?: string;
  /** Stable identity of the thing being approved, e.g. `email:17`. */
  subject: string;
  /** Hash over the exact content. Changing the content invalidates approval. */
  fingerprint: string;
  /** Seconds until the request auto-expires. Default 30 minutes. */
  ttlSeconds?: number;
}

type Listener = (request: ApprovalRequest, phase: 'requested' | 'resolved') => void;

/**
 * The single gate every irreversible action passes through.
 *
 * Contract:
 *   1. `request()` creates an open request and returns it — it never decides.
 *   2. Only `decide()`, driven by a human interaction in the UI or an
 *      unambiguous spoken approval, can grant it.
 *   3. `claim()` verifies the grant AND spends it. It fails when the approval
 *      is missing, rejected, expired, already spent, or when the content
 *      fingerprint no longer matches what the human saw.
 *
 * There is no code path that performs a gated action without a successful
 * `claim()`; see `MailAgent.sendApproved()`.
 */
export class ApprovalService {
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly repo: ApprovalRepository,
    private readonly audit: AuditLogService,
  ) {}

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(request: ApprovalRequest, phase: 'requested' | 'resolved'): void {
    for (const listener of this.listeners) listener(request, phase);
  }

  static requires(action: ApprovalAction): boolean {
    return ALWAYS_APPROVAL_REQUIRED.includes(action);
  }

  request(spec: ApprovalSpec): ApprovalRequest {
    const created = this.repo.create({
      action: spec.action,
      title: spec.title,
      facts: spec.facts,
      preview: spec.preview,
      subject: spec.subject,
      fingerprint: spec.fingerprint,
      expiresAt: isoPlus(spec.ttlSeconds ?? 30 * 60),
    });
    this.audit.log({
      actor: 'jarvis',
      action: 'freigabe.angefragt',
      subject: spec.subject,
      outcome: 'info',
      detail: `${spec.action} — ${spec.title}`,
    });
    this.emit(created, 'requested');
    return created;
  }

  listOpen(): ApprovalRequest[] {
    this.repo.expireStale();
    return this.repo.listOpen();
  }

  list(limit?: number): ApprovalRequest[] {
    this.repo.expireStale();
    return this.repo.list(limit);
  }

  get(id: number): ApprovalRequest | null {
    this.repo.expireStale();
    return this.repo.get(id);
  }

  openFor(subject: string): ApprovalRequest | null {
    this.repo.expireStale();
    return this.repo.openForSubject(subject);
  }

  decide(id: number, granted: boolean, evidence: string): Result<ApprovalRequest> {
    this.repo.expireStale();
    const current = this.repo.get(id);
    if (!current) {
      return err(makeError('approval.not_found', `Freigabe ${id} existiert nicht.`));
    }
    if (current.status !== 'offen') {
      return err(
        makeError(
          'approval.not_open',
          `Diese Freigabe ist bereits ${current.status}. Bitte die Aktion erneut anfordern.`,
        ),
      );
    }
    const decided = this.repo.decide(id, granted ? 'freigegeben' : 'abgelehnt', evidence);
    if (!decided) {
      return err(makeError('approval.decide_failed', 'Die Freigabe konnte nicht gespeichert werden.'));
    }
    this.audit.log({
      actor: 'benutzer',
      action: granted ? 'freigabe.erteilt' : 'freigabe.abgelehnt',
      subject: decided.subject,
      outcome: granted ? 'ok' : 'abgelehnt',
      detail: `Beleg: ${evidence}`,
    });
    this.emit(decided, 'resolved');
    return ok(decided);
  }

  /**
   * Verifies and spends the approval for `subject` at exactly `fingerprint`.
   * This is the only function that may unlock a gated action.
   */
  claim(subject: string, fingerprint: string): Result<ApprovalRequest> {
    this.repo.expireStale();
    const granted = this.repo.latestGranted(subject);
    if (!granted) {
      const open = this.repo.openForSubject(subject);
      return err(
        makeError(
          'approval.missing',
          open
            ? 'Für diese Aktion liegt noch keine Freigabe vor — sie wartet auf Ihre Entscheidung.'
            : 'Für diese Aktion liegt keine Freigabe vor.',
          { hint: 'Aktion erneut anfordern und im Freigabefenster bestätigen.' },
        ),
      );
    }
    if (granted.fingerprint !== fingerprint) {
      this.audit.log({
        actor: 'system',
        action: 'freigabe.ungueltig',
        subject,
        outcome: 'abgelehnt',
        detail: 'Inhalt wurde nach der Freigabe geändert.',
      });
      return err(
        makeError(
          'approval.stale',
          'Der Inhalt wurde nach der Freigabe geändert. Bitte erneut freigeben.',
          { hint: 'Die Vorschau zeigt die aktuelle Fassung — diese muss neu bestätigt werden.' },
        ),
      );
    }
    if (!this.repo.consume(granted.id)) {
      return err(
        makeError(
          'approval.already_used',
          'Diese Freigabe wurde bereits verwendet. Für einen erneuten Versand ist eine neue Freigabe nötig.',
        ),
      );
    }
    this.audit.log({
      actor: 'system',
      action: 'freigabe.eingeloest',
      subject,
      outcome: 'ok',
      detail: `Freigabe ${granted.id}`,
    });
    return ok(granted);
  }
}
