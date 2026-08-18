import type { AuditEntry, Result } from '../../shared/types.js';
import { ok } from '../../shared/types.js';
import type { AuditRepository } from '../db/repositories/misc.js';
import type { CredentialService } from './CredentialService.js';

type Listener = (entry: AuditEntry) => void;

/**
 * Append-only record of everything JARVIS did (§18).
 *
 * Entries are written synchronously as part of the action they describe, so
 * the log cannot drift from reality. Detail text is passed through the
 * credential redactor before it is stored.
 */
export class AuditLogService {
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly repo: AuditRepository,
    private readonly credentials?: CredentialService,
  ) {}

  onEntry(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  log(entry: {
    actor: AuditEntry['actor'];
    action: string;
    outcome?: AuditEntry['outcome'];
    agent?: string;
    subject?: string;
    detail?: string;
  }): AuditEntry {
    const detail = entry.detail ? this.credentials?.redact(entry.detail) ?? entry.detail : undefined;
    const written = this.repo.append({
      actor: entry.actor,
      action: entry.action,
      outcome: entry.outcome ?? 'info',
      agent: entry.agent ?? null,
      subject: entry.subject ?? null,
      detail: detail ?? null,
    });
    for (const listener of this.listeners) listener(written);
    return written;
  }

  list(limit = 200): AuditEntry[] {
    return this.repo.list(limit);
  }

  exportCsv(): Result<string> {
    const rows = this.repo.all();
    const escape = (value: string | null | undefined): string => {
      const text = value ?? '';
      return `"${text.replaceAll('"', '""')}"`;
    };
    const lines = ['Zeit;Akteur;Agent;Aktion;Objekt;Ergebnis;Detail'];
    for (const row of rows.slice().reverse()) {
      lines.push(
        [
          escape(row.at),
          escape(row.actor),
          escape(row.agent),
          escape(row.action),
          escape(row.subject),
          escape(row.outcome),
          escape(row.detail),
        ].join(';'),
      );
    }
    return ok(lines.join('\r\n'));
  }
}
