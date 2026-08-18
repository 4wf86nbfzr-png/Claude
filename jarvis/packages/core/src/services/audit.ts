import type { AuditRepo } from '../db/repos/misc.js';
import type { AuditRow } from '../db/schema.js';
import type { EventBus } from './events.js';

/**
 * Das Audit-Log ist die Nachweisebene: was hat JARVIS wann getan und auf
 * wessen Anweisung. Jede Zeile ist ein deutscher Satz, damit sie im Fenster
 * ohne Uebersetzung lesbar ist.
 */
export class AuditLogService {
  constructor(
    private readonly repo: AuditRepo,
    private readonly bus?: EventBus,
  ) {}

  log(input: {
    actor: string;
    action: string;
    summary: string;
    entityType?: string | null;
    entityId?: string | null;
    detail?: unknown;
    outcome?: 'ok' | 'fehler' | 'abgebrochen';
  }): AuditRow {
    const row = this.repo.append(input);
    this.bus?.emit('audit', row);
    return row;
  }

  /** Kurzform fuer Fehlerfaelle. */
  failure(actor: string, action: string, summary: string, detail?: unknown, entity?: { type?: string; id?: string }): AuditRow {
    return this.log({
      actor,
      action,
      summary,
      detail,
      outcome: 'fehler',
      entityType: entity?.type ?? null,
      entityId: entity?.id ?? null,
    });
  }

  list(filter?: { entityType?: string; entityId?: string; since?: string; limit?: number }): AuditRow[] {
    return this.repo.list(filter ?? {});
  }

  /** Vorlesbare Fassung: "10:41 Recherche gestartet". */
  static toSpokenLine(row: AuditRow, locale = 'de-DE'): string {
    const time = new Date(row.ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return `${time} ${row.summary}`;
  }
}
