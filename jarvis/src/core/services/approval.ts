import type { ApprovalRepo } from '../db/repositories/approvals';
import type { Approval } from '../../shared/types';
import { ApprovalStatus } from '../../shared/status';
import type { AuditLogService } from './audit';
import type { EventBus } from './events';

/**
 * Handlungen, die IMMER eine ausdrückliche Freigabe brauchen (§11).
 *
 * Die Liste ist der einzige Ort, an dem festgelegt wird, was kritisch ist.
 * Werkzeuge tragen ihre Aktion hier ein; wer ein Werkzeug ergänzt, ergänzt
 * bei Bedarf auch diese Liste.
 */
export const KRITISCHE_AKTIONEN: Record<string, string> = {
  send_email: 'E-Mail versenden',
  send_email_batch: 'Mehrere E-Mails versenden',
  delete_file: 'Datei löschen',
  overwrite_file: 'Datei überschreiben',
  install_application: 'Programm installieren',
  change_system_setting: 'Systemeinstellung ändern',
  paid_action: 'Kostenpflichtige Aktion auslösen',
  modify_account: 'Konto verändern',
  publish_content: 'Inhalte veröffentlichen',
  submit_form: 'Formular absenden',
  message_external_person: 'Nachricht an externe Person senden'
};

export function requiresApproval(action: string): boolean {
  return action in KRITISCHE_AKTIONEN;
}

export interface ApprovalRequestInput {
  action: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  contentHash: string;
  ttlMinutes?: number;
}

export type ConsumeResult =
  | { ok: true; approval: Approval }
  | { ok: false; reason: string; status?: ApprovalStatus };

/**
 * Freigabestelle (§11).
 *
 * Aufbau bewusst so, dass eine Freigabe drei Dinge gleichzeitig festhält:
 * welche Aktion, mit welchem Inhalt (Prüfsumme) und wie lange gültig.
 * Beim Einlösen müssen alle drei passen, danach ist die Freigabe verbraucht.
 * Eine Freigabe kann also nie für eine zweite Mail wiederverwendet werden.
 */
export class ApprovalService {
  constructor(
    private readonly repo: ApprovalRepo,
    private readonly audit: AuditLogService,
    private readonly bus: EventBus,
    private readonly defaultTtlMinutes = 30
  ) {}

  request(input: ApprovalRequestInput): Approval {
    const ttl = input.ttlMinutes ?? this.defaultTtlMinutes;
    const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
    const approval = this.repo.create({
      action: input.action,
      title: input.title,
      summary: input.summary,
      payload: input.payload,
      contentHash: input.contentHash,
      expiresAt
    });
    this.audit.log('Freigabe angefragt', {
      actor: 'JARVIS',
      target: input.title,
      status: 'INFO',
      detail: { approvalId: approval.id, action: input.action }
    });
    this.bus.emit({ kind: 'approval', approvalId: approval.id, text: input.title });
    return approval;
  }

  /** Entscheidung des Benutzers festhalten. */
  decide(id: number, freigegeben: boolean, note?: string): Approval {
    const approval = this.repo.byId(id);
    if (!approval) throw new Error(`Freigabe ${id} existiert nicht.`);
    if (approval.status !== ApprovalStatus.OFFEN) {
      throw new Error(`Freigabe ${id} wurde bereits entschieden (${approval.status}).`);
    }
    const next = this.repo.setStatus(
      id,
      freigegeben ? ApprovalStatus.FREIGEGEBEN : ApprovalStatus.ABGELEHNT,
      'BENUTZER',
      note ?? null
    )!;
    this.audit.log(freigegeben ? 'Freigabe erteilt' : 'Freigabe verweigert', {
      actor: 'BENUTZER',
      target: approval.title,
      status: freigegeben ? 'OK' : 'ABGELEHNT',
      detail: { approvalId: id, action: approval.action, note: note ?? null }
    });
    this.bus.emit({ kind: 'approval', approvalId: id, text: freigegeben ? 'freigegeben' : 'abgelehnt' });
    return next;
  }

  /**
   * Freigabe einlösen. Gibt nur dann `ok` zurück, wenn sie freigegeben,
   * unverbraucht, nicht abgelaufen und inhaltlich unverändert ist.
   * Der Aufrufer darf die Aktion ausschließlich bei `ok: true` ausführen.
   */
  consume(id: number, expect: { action: string; contentHash: string }): ConsumeResult {
    const approval = this.repo.byId(id);
    if (!approval) return { ok: false, reason: `Freigabe ${id} existiert nicht.` };
    if (approval.action !== expect.action) {
      return {
        ok: false,
        reason: `Die Freigabe gilt für "${approval.action}", nicht für "${expect.action}".`,
        status: approval.status
      };
    }
    if (approval.status !== ApprovalStatus.FREIGEGEBEN) {
      return {
        ok: false,
        reason:
          approval.status === ApprovalStatus.OFFEN
            ? 'Diese Aktion wartet noch auf Ihre Freigabe.'
            : `Freigabe nicht verwendbar (Status: ${approval.status}).`,
        status: approval.status
      };
    }
    if (approval.expiresAt && new Date(approval.expiresAt).getTime() <= Date.now()) {
      this.repo.setStatus(id, ApprovalStatus.ABGELAUFEN, 'SYSTEM', 'Beim Einlösen abgelaufen');
      return { ok: false, reason: 'Die Freigabe ist abgelaufen. Bitte erneut freigeben.', status: ApprovalStatus.ABGELAUFEN };
    }
    if (approval.contentHash !== expect.contentHash) {
      this.audit.log('Freigabe passt nicht zum Inhalt', {
        actor: 'SYSTEM',
        target: approval.title,
        status: 'ABGELEHNT',
        detail: { approvalId: id, erwartet: expect.contentHash, freigegeben: approval.contentHash }
      });
      return {
        ok: false,
        reason:
          'Der Inhalt hat sich nach der Freigabe geändert. Aus Sicherheitsgründen wird nicht gesendet – bitte erneut prüfen und freigeben.',
        status: approval.status
      };
    }
    const consumed = this.repo.setStatus(id, ApprovalStatus.VERBRAUCHT, 'SYSTEM', 'Eingelöst')!;
    return { ok: true, approval: consumed };
  }

  pending(): Approval[] {
    this.repo.expireOverdue();
    return this.repo.open();
  }

  byId(id: number): Approval | null {
    return this.repo.byId(id);
  }

  history(limit = 100): Approval[] {
    return this.repo.list(limit);
  }
}
