import type { AuditRepo } from '../db/repositories/audit';
import type { AuditEntry } from '../../shared/types';
import type { EventBus } from './events';

/**
 * Protokolldienst (§18).
 *
 * Jede nach außen wirksame Handlung wird hier festgehalten – auch die
 * fehlgeschlagenen und die abgelehnten. Das Protokoll ist die Grundlage
 * dafür, dass nachvollziehbar bleibt, was JARVIS getan hat.
 */
export class AuditLogService {
  constructor(
    private readonly repo: AuditRepo,
    private readonly bus?: EventBus
  ) {}

  log(
    action: string,
    options: {
      actor?: AuditEntry['actor'];
      agent?: string | null;
      target?: string | null;
      status?: AuditEntry['status'];
      detail?: Record<string, unknown> | null;
    } = {}
  ): AuditEntry {
    const entry = this.repo.append({
      actor: options.actor ?? 'JARVIS',
      agent: options.agent ?? null,
      action,
      target: options.target ?? null,
      status: options.status ?? 'INFO',
      detail: options.detail ?? null
    });
    this.bus?.emit({ kind: 'progress', text: `${action}${entry.target ? ` – ${entry.target}` : ''}`, detail: entry });
    return entry;
  }

  recent(limit = 200): AuditEntry[] {
    return this.repo.recent(limit);
  }

  /** Protokoll eines Tages, aufsteigend – wie in §18 beschrieben. */
  forDay(date: Date): AuditEntry[] {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return this.repo
      .recent(1000, start.toISOString())
      .filter((entry) => entry.ts < end.toISOString())
      .reverse();
  }
}
