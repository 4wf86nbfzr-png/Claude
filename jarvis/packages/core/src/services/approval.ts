import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ApprovalRepo } from '../db/repos/approvals.js';
import type { ApprovalRow } from '../db/schema.js';
import { err, fromException, ok, type Result } from '../util/result.js';
import { nowIso } from '../util/text.js';
import type { AuditLogService } from './audit.js';
import type { EventBus } from './events.js';

/**
 * Aktionen, die immer eine Freigabe brauchen. Die Liste ist bewusst
 * abgeschlossen: ein Tool, das eine dieser Aktionen ausloest, muss seinen
 * Typ hier eintragen, sonst laesst die Engine ihn gar nicht erst zu.
 */
export const APPROVAL_ACTIONS = {
  'mail.senden': 'E-Mail versenden',
  'mail.bulk_senden': 'Mehrere E-Mails versenden',
  'datei.loeschen': 'Datei löschen',
  'datei.ueberschreiben': 'Datei überschreiben',
  'programm.installieren': 'Programm installieren',
  'system.einstellung': 'Systemeinstellung ändern',
  'kosten.verursachen': 'Kostenpflichtige Aktion',
  'account.aendern': 'Zugangsdaten oder Konto ändern',
  'daten.veroeffentlichen': 'Daten veröffentlichen',
  'formular.absenden': 'Formular absenden',
  'nachricht.extern': 'Nachricht an externe Person senden',
} as const;

export type ApprovalAction = keyof typeof APPROVAL_ACTIONS;

export function isApprovalAction(v: string): v is ApprovalAction {
  return v in APPROVAL_ACTIONS;
}

export interface ApprovalRequest {
  actionType: ApprovalAction;
  title: string;
  /** Eine Zeile Klartext -- wird vorgelesen und im Dialog gezeigt. */
  summary: string;
  /** Genau die Daten, die der Executor spaeter bekommt. */
  payload: Record<string, unknown> & { entityId?: string };
  /** Inhaltssignatur; aendert sie sich, verfaellt die Freigabe. */
  contentHash?: string | null;
  risk?: 'niedrig' | 'mittel' | 'hoch';
  requestedBy: string;
  /** Gueltigkeitsdauer in Minuten (Standard 24 h). */
  validForMinutes?: number;
  /** Strukturierte Details fuer den Freigabedialog (Empfaenger, Betreff, Text). */
  details?: ApprovalDetail[];
}

export interface ApprovalDetail {
  label: string;
  value: string;
  /** `long` wird im Dialog als Textblock dargestellt, nicht als Zeile. */
  kind?: 'kurz' | 'long';
}

/**
 * Nachweis, dass eine Aktion freigegeben wurde.
 *
 * Der Wert ist mit einem prozesslokalen Zufallsschluessel signiert. Ein
 * Agent kann sich so ein Objekt also nicht selbst bauen -- der einzige Weg
 * an einen gueltigen Permit fuehrt ueber eine tatsaechlich erteilte Freigabe.
 */
export interface ActionPermit {
  readonly approvalId: string;
  readonly actionType: ApprovalAction;
  readonly contentHash: string | null;
  readonly issuedAt: string;
  readonly signature: string;
}

/** Der Executor fuehrt die eigentliche Aktion aus, nachdem freigegeben wurde. */
export type ApprovalExecutor = (
  payload: Record<string, unknown>,
  permit: ActionPermit,
  approval: ApprovalRow,
) => Promise<Result<unknown>>;

/**
 * Prueft vor der Ausfuehrung, ob sich der Gegenstand seit der Anfrage
 * geaendert hat (z.B. Mailtext nachtraeglich bearbeitet).
 */
export type ApprovalValidator = (approval: ApprovalRow) => Result<void>;

export interface ApprovalServiceOptions {
  repo: ApprovalRepo;
  audit: AuditLogService;
  bus?: EventBus;
  defaultValidMinutes?: number;
}

export class ApprovalService {
  private readonly repo: ApprovalRepo;
  private readonly audit: AuditLogService;
  private readonly bus: EventBus | undefined;
  private readonly defaultValidMinutes: number;
  private readonly executors = new Map<ApprovalAction, ApprovalExecutor>();
  private readonly validators = new Map<ApprovalAction, ApprovalValidator>();
  /** Nur im Arbeitsspeicher, neu bei jedem Start. */
  private readonly signingKey = randomBytes(32);

  constructor(options: ApprovalServiceOptions) {
    this.repo = options.repo;
    this.audit = options.audit;
    this.bus = options.bus;
    this.defaultValidMinutes = options.defaultValidMinutes ?? 24 * 60;
  }

  registerExecutor(action: ApprovalAction, executor: ApprovalExecutor): void {
    this.executors.set(action, executor);
  }

  registerValidator(action: ApprovalAction, validator: ApprovalValidator): void {
    this.validators.set(action, validator);
  }

  // --- Anfrage ------------------------------------------------------------

  /**
   * Legt eine Freigabeanfrage an. Fuehrt bewusst *nichts* aus und wartet auch
   * nicht: der Agent meldet dem Nutzer "wartet auf Freigabe" und ist fertig.
   * Die Anfrage ueberlebt einen Neustart, weil sie in der Datenbank steht.
   */
  request(req: ApprovalRequest): ApprovalRow {
    if (!isApprovalAction(req.actionType)) {
      throw new Error(`Unbekannter Freigabetyp: ${req.actionType}`);
    }
    const minutes = req.validForMinutes ?? this.defaultValidMinutes;
    const row = this.repo.create({
      actionType: req.actionType,
      title: req.title,
      summary: req.summary,
      payload: { ...req.payload, __details: req.details ?? [] },
      contentHash: req.contentHash ?? null,
      risk: req.risk ?? 'mittel',
      requestedBy: req.requestedBy,
      expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    });

    this.audit.log({
      actor: req.requestedBy,
      action: 'freigabe.angefragt',
      summary: `Freigabe angefragt: ${req.title}`,
      entityType: 'approval',
      entityId: row.id,
      detail: { actionType: req.actionType, summary: req.summary },
    });
    this.bus?.emit('approval', row);
    this.bus?.emit('status', { state: 'WAITING FOR APPROVAL', detail: req.title });
    return row;
  }

  get(id: string): ApprovalRow | undefined {
    return this.repo.get(id);
  }

  pending(): ApprovalRow[] {
    this.repo.expireOverdue();
    return this.repo.pending();
  }

  list(limit = 100): ApprovalRow[] {
    return this.repo.list({ limit });
  }

  details(row: ApprovalRow): ApprovalDetail[] {
    const payload = this.repo.payloadOf<Record<string, unknown>>(row);
    const d = payload.__details;
    return Array.isArray(d) ? (d as ApprovalDetail[]) : [];
  }

  payload(row: ApprovalRow): Record<string, unknown> {
    const p = this.repo.payloadOf<Record<string, unknown>>(row);
    const { __details, ...rest } = p;
    void __details;
    return rest;
  }

  /**
   * Loest eine gesprochene oder getippte Zustimmung auf.
   * "Nummer 4 freigeben" bezieht sich auf die Reihenfolge in `pending()`.
   */
  resolveByOrdinal(n: number): ApprovalRow | undefined {
    const list = this.pending();
    return n >= 1 && n <= list.length ? list[n - 1] : undefined;
  }

  // --- Entscheidung -------------------------------------------------------

  async approve(id: string, by = 'benutzer', note?: string): Promise<Result<unknown>> {
    const row = this.repo.get(id);
    if (!row) return err('NOT_FOUND', `Freigabeanfrage ${id} existiert nicht.`);

    if (row.status !== 'offen') {
      return err(
        'APPROVAL_STALE',
        `Diese Anfrage ist nicht mehr offen (Status: ${row.status}).`,
        { hint: 'Bitte einen neuen Entwurf erstellen und erneut freigeben.' },
      );
    }
    if (row.expires_at && row.expires_at < nowIso()) {
      this.repo.decide(id, 'abgelaufen', by, 'Zeitfenster abgelaufen');
      return err('APPROVAL_STALE', 'Die Freigabeanfrage ist abgelaufen.', {
        hint: 'Bitte den Entwurf erneut zur Freigabe stellen.',
      });
    }

    const action = row.action_type as ApprovalAction;

    // Hat sich der Gegenstand seit der Anfrage veraendert?
    const validator = this.validators.get(action);
    if (validator) {
      const check = validator(row);
      if (!check.ok) {
        this.audit.failure(by, 'freigabe.ungueltig', `Freigabe abgewiesen: ${check.error.message}`, check.error, {
          type: 'approval',
          id,
        });
        return check;
      }
    }

    const executor = this.executors.get(action);
    if (!executor) {
      return err('NOT_IMPLEMENTED', `Fuer "${APPROVAL_ACTIONS[action] ?? action}" ist keine Ausfuehrung hinterlegt.`);
    }

    const decided = this.repo.decide(id, 'freigegeben', by, note);
    if (!decided) return err('INTERNAL_ERROR', 'Freigabe konnte nicht gespeichert werden.');

    this.audit.log({
      actor: by,
      action: 'freigabe.erteilt',
      summary: `Versand durch Benutzer freigegeben: ${row.title}`,
      entityType: 'approval',
      entityId: id,
    });
    this.bus?.emit('approval', decided);
    this.bus?.emit('status', { state: 'EXECUTING', detail: row.title });

    const permit = this.issuePermit(decided);
    let result: Result<unknown>;
    try {
      result = await executor(this.payload(decided), permit, decided);
    } catch (e) {
      result = fromException(e);
    }

    const finalRow = this.repo.markExecuted(id, result.ok, result.ok ? result.data : result.error);
    if (finalRow) this.bus?.emit('approval', finalRow);

    this.audit.log({
      actor: 'jarvis',
      action: result.ok ? 'freigabe.ausgefuehrt' : 'freigabe.fehlgeschlagen',
      summary: result.ok
        ? `Aktion ausgefuehrt: ${row.title}`
        : `Aktion fehlgeschlagen: ${row.title} (${result.error.message})`,
      entityType: 'approval',
      entityId: id,
      outcome: result.ok ? 'ok' : 'fehler',
      detail: result.ok ? result.data : result.error,
    });

    return result;
  }

  reject(id: string, by = 'benutzer', note?: string): Result<ApprovalRow> {
    const row = this.repo.get(id);
    if (!row) return err('NOT_FOUND', `Freigabeanfrage ${id} existiert nicht.`);
    if (row.status !== 'offen') {
      return err('APPROVAL_STALE', `Diese Anfrage ist nicht mehr offen (Status: ${row.status}).`);
    }
    const updated = this.repo.decide(id, 'abgelehnt', by, note);
    this.audit.log({
      actor: by,
      action: 'freigabe.abgelehnt',
      summary: `Freigabe abgelehnt: ${row.title}`,
      entityType: 'approval',
      entityId: id,
      detail: { note },
      outcome: 'abgebrochen',
    });
    if (updated) this.bus?.emit('approval', updated);
    return ok(updated ?? row);
  }

  // --- Permit -------------------------------------------------------------

  private issuePermit(row: ApprovalRow): ActionPermit {
    const issuedAt = nowIso();
    const base: Omit<ActionPermit, 'signature'> = {
      approvalId: row.id,
      actionType: row.action_type as ApprovalAction,
      contentHash: row.content_hash,
      issuedAt,
    };
    return { ...base, signature: this.sign(base) };
  }

  /**
   * Prueft einen Permit. Ausfuehrende Stellen (z.B. der Mailversand) rufen
   * das auf, bevor sie irgendetwas nach aussen geben.
   */
  verifyPermit(
    permit: ActionPermit | null | undefined,
    expected: { actionType: ApprovalAction; contentHash?: string | null },
  ): Result<ApprovalRow> {
    if (!permit) {
      return err('APPROVAL_MISSING', 'Für diese Aktion liegt keine Freigabe vor.', {
        hint: 'Die Aktion muss zuerst über die Freigabe-Ansicht bestätigt werden.',
      });
    }
    const { signature, ...base } = permit;
    const expectedSig = this.sign(base);
    const a = Buffer.from(signature ?? '', 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return err('APPROVAL_MISSING', 'Der Freigabenachweis ist ungültig.', {
        hint: 'Bitte die Aktion erneut über die Freigabe-Ansicht bestätigen.',
      });
    }
    if (permit.actionType !== expected.actionType) {
      return err('APPROVAL_MISSING', 'Der Freigabenachweis gehört zu einer anderen Aktion.');
    }
    const row = this.repo.get(permit.approvalId);
    if (!row) return err('NOT_FOUND', 'Zur Freigabe existiert kein Eintrag mehr.');
    if (row.status !== 'freigegeben') {
      return err('APPROVAL_STALE', `Die Freigabe ist nicht (mehr) gültig (Status: ${row.status}).`);
    }
    if (expected.contentHash !== undefined && expected.contentHash !== null) {
      if (permit.contentHash !== expected.contentHash) {
        return err(
          'APPROVAL_STALE',
          'Der Inhalt wurde nach der Freigabe geändert. Die Freigabe gilt damit nicht mehr.',
          { hint: 'Bitte den geänderten Entwurf erneut freigeben.' },
        );
      }
    }
    return ok(row);
  }

  private sign(base: Omit<ActionPermit, 'signature'>): string {
    return createHmac('sha256', this.signingKey)
      .update(`${base.approvalId}|${base.actionType}|${base.contentHash ?? ''}|${base.issuedAt}`)
      .digest('hex');
  }
}
