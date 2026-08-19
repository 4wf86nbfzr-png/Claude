import type { JarvisEnv } from '../config/env.js';
import type { EmailRow } from '../db/schema.js';
import type { Repositories } from '../db/repos/index.js';
import type { ComplianceGuard } from '../compliance/guard.js';
import type { AuditLogService } from '../services/audit.js';
import type { ActionPermit, ApprovalService } from '../services/approval.js';
import type { EventBus } from '../services/events.js';
import { err, fromException, ok, type Result } from '../util/result.js';
import { contentHash, domainOfEmail, truncate } from '../util/text.js';
import type { MailTransport, OutgoingMessage, SendOutcome } from './types.js';
import { hashEmail } from '../db/repos/emails.js';

export interface MailServiceOptions {
  env: JarvisEnv;
  repos: Repositories;
  compliance: ComplianceGuard;
  approvals: ApprovalService;
  audit: AuditLogService;
  bus?: EventBus;
  transport: MailTransport | null;
}

export interface DraftRequest {
  to: string;
  subject: string;
  body: string;
  toName?: string | null;
  cc?: string[];
  bcc?: string[];
  companyId?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  inReplyTo?: string | null;
}

export interface DraftView {
  email: EmailRow;
  warnungen: Array<{ code: string; message: string }>;
  anhaenge: Array<{ id: string; filename: string; path: string }>;
}

/**
 * MailAgent-Unterbau.
 *
 * Die zentrale Regel des Projekts steht hier in Code: `send` verlangt einen
 * `ActionPermit`, den ausschliesslich die Approval-Engine nach einer echten
 * Freigabe ausstellt. Ein Agent kann diese Methode zwar aufrufen, aber ohne
 * Permit passiert nichts -- der Aufruf endet mit APPROVAL_MISSING.
 */
export class MailService {
  private readonly env: JarvisEnv;
  private readonly repos: Repositories;
  private readonly compliance: ComplianceGuard;
  private readonly approvals: ApprovalService;
  private readonly audit: AuditLogService;
  private readonly bus: EventBus | undefined;
  private transport: MailTransport | null;

  constructor(options: MailServiceOptions) {
    this.env = options.env;
    this.repos = options.repos;
    this.compliance = options.compliance;
    this.approvals = options.approvals;
    this.audit = options.audit;
    this.bus = options.bus;
    this.transport = options.transport;

    // Der einzige registrierte Ausfuehrer fuer 'mail.senden'.
    this.approvals.registerExecutor('mail.senden', async (payload, permit) => {
      const emailId = String(payload.entityId ?? '');
      return this.send(emailId, permit);
    });
    this.approvals.registerExecutor('mail.bulk_senden', async (payload, permit) => {
      const ids = Array.isArray(payload.emailIds) ? (payload.emailIds as string[]) : [];
      return this.sendMany(ids, permit);
    });

    // Vor der Ausfuehrung: hat sich der Text seit der Anfrage geaendert?
    this.approvals.registerValidator('mail.senden', (approval) => {
      const payload = this.approvals.payload(approval);
      const email = this.repos.emails.get(String(payload.entityId ?? ''));
      if (!email) return err('NOT_FOUND', 'Der zugehörige Entwurf existiert nicht mehr.');
      if (email.content_hash !== approval.content_hash) {
        return err('APPROVAL_STALE', 'Der Entwurf wurde nach der Freigabeanfrage geändert.', {
          hint: 'Bitte den geänderten Entwurf erneut zur Freigabe stellen.',
        });
      }
      return ok(undefined);
    });
  }

  setTransport(transport: MailTransport | null): void {
    this.transport = transport;
  }

  get activeTransport(): MailTransport | null {
    return this.transport;
  }

  transportStatus(): { id: string; label: string; bereit: boolean; hinweis: string | null } {
    if (!this.transport) {
      return {
        id: 'none',
        label: 'Kein Versandweg',
        bereit: false,
        hinweis: 'JARVIS_MAIL_TRANSPORT ist auf "none" gesetzt. In den Einstellungen SMTP, Gmail oder Microsoft 365 wählen.',
      };
    }
    return {
      id: this.transport.id,
      label: this.transport.label,
      bereit: this.transport.isConfigured(),
      hinweis: this.transport.missingConfigHint(),
    };
  }

  // --- Entwuerfe ----------------------------------------------------------

  async createDraft(request: DraftRequest): Promise<Result<DraftView>> {
    const to = request.to.trim();
    if (!isPlausibleAddress(to)) {
      return err('INVALID_INPUT', `"${to}" sieht nicht wie eine E-Mail-Adresse aus.`);
    }
    if (!request.subject.trim()) return err('INVALID_INPUT', 'Der Betreff fehlt.');
    if (!request.body.trim()) return err('INVALID_INPUT', 'Der Mailtext fehlt.');

    const from = await this.resolveFrom();
    const company = request.companyId ? this.repos.companies.get(request.companyId) : undefined;

    const email = this.repos.emails.createDraft({
      toAddress: to,
      toName: request.toName ?? null,
      subject: request.subject.trim(),
      bodyText: request.body,
      cc: request.cc?.length ? request.cc.join(', ') : null,
      bcc: request.bcc?.length ? request.bcc.join(', ') : null,
      fromAddress: from?.address ?? null,
      replyTo: this.env.JARVIS_MAIL_REPLY_TO ?? null,
      companyId: request.companyId ?? null,
      contactId: request.contactId ?? null,
      campaignId: request.campaignId ?? null,
      inReplyTo: request.inReplyTo ?? null,
      threadKey: contentHash([domainOfEmail(to), company?.id ?? to]),
    });

    this.audit.log({
      actor: 'MailAgent',
      action: 'mail.entwurf_erstellt',
      summary: `Entwurf erstellt für ${to}: "${email.subject}"`,
      entityType: 'email',
      entityId: email.id,
    });
    this.bus?.emit('invalidate', { scope: 'emails' });

    return ok(this.view(email, company?.name ?? null));
  }

  updateDraft(
    emailId: string,
    patch: { to?: string; subject?: string; body?: string; cc?: string[]; bcc?: string[]; toName?: string | null },
  ): Result<DraftView> {
    const current = this.repos.emails.get(emailId);
    if (!current) return err('NOT_FOUND', `Es gibt keinen Entwurf mit der Kennung ${emailId}.`);
    if (current.status === 'gesendet') {
      return err('INVALID_INPUT', 'Diese Mail wurde bereits gesendet und kann nicht mehr geändert werden.');
    }
    if (patch.to && !isPlausibleAddress(patch.to)) {
      return err('INVALID_INPUT', `"${patch.to}" sieht nicht wie eine E-Mail-Adresse aus.`);
    }

    const updated = this.repos.emails.updateDraft(emailId, {
      ...(patch.to ? { to_address: patch.to.trim() } : {}),
      ...(patch.toName !== undefined ? { to_name: patch.toName } : {}),
      ...(patch.subject ? { subject: patch.subject.trim() } : {}),
      ...(patch.body ? { body_text: patch.body } : {}),
      ...(patch.cc ? { cc: patch.cc.join(', ') } : {}),
      ...(patch.bcc ? { bcc: patch.bcc.join(', ') } : {}),
    });
    if (!updated) return err('NOT_FOUND', 'Entwurf nicht gefunden.');

    // Eine inhaltliche Aenderung entwertet eine bestehende Freigabe.
    if (updated.content_hash !== current.content_hash && current.approval_id) {
      this.approvals.reject(current.approval_id, 'jarvis', 'Entwurf nach der Anfrage geändert');
    }

    this.audit.log({
      actor: 'benutzer',
      action: 'mail.entwurf_geaendert',
      summary: `Entwurf geändert: "${updated.subject}"`,
      entityType: 'email',
      entityId: emailId,
      detail: { felder: Object.keys(patch) },
    });
    this.bus?.emit('invalidate', { scope: 'emails' });

    const company = updated.company_id ? this.repos.companies.get(updated.company_id) : undefined;
    return ok(this.view(updated, company?.name ?? null));
  }

  get(emailId: string): Result<DraftView> {
    const email = this.repos.emails.get(emailId);
    if (!email) return err('NOT_FOUND', `Es gibt keine Mail mit der Kennung ${emailId}.`);
    const company = email.company_id ? this.repos.companies.get(email.company_id) : undefined;
    return ok(this.view(email, company?.name ?? null));
  }

  private view(email: EmailRow, companyName: string | null): DraftView {
    return {
      email,
      warnungen:
        email.direction === 'ausgehend' && email.status !== 'gesendet'
          ? this.compliance.warningsForDraft({
              address: email.to_address,
              companyId: email.company_id,
              companyName,
              isReply: Boolean(email.in_reply_to),
            })
          : [],
      anhaenge: this.repos.emails.attachmentsOf(email.id).map((a) => ({ id: a.id, filename: a.filename, path: a.path })),
    };
  }

  /** Vorlesetext: Empfaenger, Betreff, Text -- in dieser Reihenfolge. */
  spokenVersion(emailId: string): Result<string> {
    const email = this.repos.emails.get(emailId);
    if (!email) return err('NOT_FOUND', `Es gibt keine Mail mit der Kennung ${emailId}.`);
    const company = email.company_id ? this.repos.companies.get(email.company_id) : undefined;
    const empfaenger = company ? `${company.name}, ${email.to_address}` : email.to_address;
    return ok(
      [
        `Empfänger: ${empfaenger}.`,
        `Betreff: ${email.subject}.`,
        'Text:',
        email.body_text,
      ].join('\n'),
    );
  }

  // --- Freigabe -----------------------------------------------------------

  /**
   * Stellt einen Entwurf zur Freigabe. Fuehrt nichts aus -- der Versand
   * passiert erst, wenn der Nutzer die Anfrage bestaetigt.
   */
  requestSendApproval(emailId: string, requestedBy = 'MailAgent'): Result<{ approvalId: string; email: EmailRow }> {
    const email = this.repos.emails.get(emailId);
    if (!email) return err('NOT_FOUND', `Es gibt keinen Entwurf mit der Kennung ${emailId}.`);
    if (email.status === 'gesendet') return err('DUPLICATE', 'Diese Mail wurde bereits gesendet.');

    const company = email.company_id ? this.repos.companies.get(email.company_id) : undefined;

    // Harte Ausschlussgruende schon hier melden -- der Nutzer soll keine
    // Freigabe erteilen, die anschliessend ohnehin scheitert.
    const blocking = this.compliance.checkSuppression({
      address: email.to_address,
      companyName: company?.name ?? null,
    });
    if (!blocking.ok) return blocking;

    const verification = this.compliance.checkVerification(email.to_address);
    const duplicate = this.compliance.checkDuplicate({
      address: email.to_address,
      companyId: email.company_id,
      companyName: company?.name ?? null,
      isReply: Boolean(email.in_reply_to),
    });

    const hinweise: string[] = [];
    if (!verification.ok) hinweise.push(verification.error.message);
    if (!duplicate.ok) hinweise.push(duplicate.error.message);

    const approval = this.approvals.request({
      actionType: 'mail.senden',
      title: `E-Mail an ${company?.name ?? email.to_address}`,
      summary: `Versand an ${email.to_address} freigeben?`,
      payload: { entityId: email.id },
      contentHash: email.content_hash,
      risk: 'hoch',
      requestedBy,
      details: [
        { label: 'Empfänger', value: company ? `${company.name} · ${email.to_address}` : email.to_address },
        ...(email.cc ? [{ label: 'Kopie', value: email.cc }] : []),
        { label: 'Betreff', value: email.subject },
        { label: 'Mailtext', value: email.body_text, kind: 'long' as const },
        ...(hinweise.length ? [{ label: 'Hinweise', value: hinweise.join('\n'), kind: 'long' as const }] : []),
      ],
    });

    this.repos.emails.setStatus(emailId, 'wartet_auf_freigabe', { approvalId: approval.id });
    const target = this.repos.campaigns.findTargetByEmail(emailId);
    if (target) this.repos.campaigns.setTargetStatus(target.id, 'wartet_auf_freigabe');

    this.bus?.emit('invalidate', { scope: 'emails' });
    return ok({ approvalId: approval.id, email });
  }

  // --- Versand ------------------------------------------------------------

  /**
   * Verschickt eine Mail. Ohne gueltigen Permit passiert hier nichts.
   * Diese Methode ist die einzige Stelle im gesamten Projekt, die
   * `transport.send` aufruft.
   */
  async send(emailId: string, permit: ActionPermit | null): Promise<Result<SendOutcome>> {
    const email = this.repos.emails.get(emailId);
    if (!email) return err('NOT_FOUND', `Es gibt keinen Entwurf mit der Kennung ${emailId}.`);

    const permitCheck = this.approvals.verifyPermit(permit, {
      actionType: 'mail.senden',
      contentHash: email.content_hash,
    });
    if (!permitCheck.ok) {
      this.audit.failure('jarvis', 'mail.versand_verweigert', `Versand ohne gültige Freigabe abgelehnt (${email.to_address}).`, permitCheck.error, {
        type: 'email',
        id: emailId,
      });
      return permitCheck;
    }

    return this.deliver(emailId);
  }

  /**
   * Der tatsaechliche Zustellweg. Privat und ohne Permit-Parameter: hier
   * kommt nur hin, wer vorher eine der oeffentlichen Methoden mit gueltigem
   * Freigabenachweis durchlaufen hat.
   */
  private async deliver(emailId: string): Promise<Result<SendOutcome>> {
    const email = this.repos.emails.get(emailId);
    if (!email) return err('NOT_FOUND', `Es gibt keinen Entwurf mit der Kennung ${emailId}.`);

    if (email.status === 'gesendet') {
      return err('DUPLICATE', 'Diese Mail wurde bereits gesendet.');
    }
    if (!this.transport) {
      return err('NOT_CONFIGURED', 'Es ist kein Versandweg eingerichtet.', {
        hint: 'Einstellungen → Postfach: SMTP-Daten hinterlegen oder Gmail/Microsoft 365 verbinden.',
      });
    }
    if (!this.transport.isConfigured()) {
      return err('NOT_CONFIGURED', this.transport.missingConfigHint() ?? 'Der Versandweg ist unvollständig eingerichtet.');
    }

    const company = email.company_id ? this.repos.companies.get(email.company_id) : undefined;
    const gate = this.compliance.checkBeforeSend({
      address: email.to_address,
      companyId: email.company_id,
      companyName: company?.name ?? null,
      isReply: Boolean(email.in_reply_to),
      // Der Nutzer hat diese eine Mail bewusst freigegeben; die Dublettensperre
      // wurde ihm im Dialog als Hinweis angezeigt.
      overrideDuplicate: true,
    });
    if (!gate.ok) {
      this.repos.emails.markFailed(emailId, gate.error.message);
      this.audit.failure('jarvis', 'mail.versand_blockiert', `Versand blockiert: ${gate.error.message}`, gate.error, {
        type: 'email',
        id: emailId,
      });
      this.bus?.emit('invalidate', { scope: 'emails' });
      return gate;
    }

    const from = await this.resolveFrom();
    if (!from) {
      return err('NOT_CONFIGURED', 'Es ist keine Absenderadresse hinterlegt.', {
        hint: 'JARVIS_MAIL_FROM_ADDRESS setzen oder das Postfach verbinden.',
      });
    }

    const attachments = this.repos.emails.attachmentsOf(emailId);
    const message: OutgoingMessage = {
      from,
      to: [{ name: email.to_name, address: email.to_address }],
      ...(email.cc ? { cc: splitAddresses(email.cc) } : {}),
      ...(email.bcc ? { bcc: splitAddresses(email.bcc) } : {}),
      replyTo: email.reply_to,
      subject: email.subject,
      text: email.body_text,
      html: email.body_html,
      inReplyTo: email.in_reply_to,
      attachments: attachments.map((a) => ({ filename: a.filename, path: a.path, contentType: a.mime_type })),
    };

    this.bus?.emit('status', { state: 'EXECUTING', detail: `Sende an ${email.to_address}` });

    let outcome: Result<SendOutcome>;
    try {
      outcome = await this.transport.send(message);
    } catch (e) {
      outcome = fromException(e, 'SEND_FAILED');
    }

    if (!outcome.ok) {
      // Kein Beschoenigen: Fehlschlag wird als Fehlschlag protokolliert.
      this.repos.emails.markFailed(emailId, outcome.error.message);
      const target = this.repos.campaigns.findTargetByEmail(emailId);
      if (target) this.repos.campaigns.setTargetStatus(target.id, 'fehler', outcome.error.message);
      this.audit.failure('MailAgent', 'mail.versand_fehlgeschlagen', `Versand fehlgeschlagen an ${email.to_address}: ${outcome.error.message}`, outcome.error, {
        type: 'email',
        id: emailId,
      });
      this.bus?.emit('invalidate', { scope: 'emails' });
      this.bus?.emit('error', { message: `Versand fehlgeschlagen: ${outcome.error.message}`, hint: outcome.error.hint });
      return outcome;
    }

    this.repos.emails.markSent(emailId, { provider: outcome.data.provider, messageId: outcome.data.messageId });
    this.repos.emails.addInteraction({
      companyId: email.company_id,
      contactId: email.contact_id,
      emailId,
      kind: 'mail',
      direction: 'ausgehend',
      summary: `Akquise-Mail gesendet: "${email.subject}"`,
    });
    const target = this.repos.campaigns.findTargetByEmail(emailId);
    if (target) this.repos.campaigns.setTargetStatus(target.id, 'gesendet');
    if (email.company_id) this.repos.companies.updateStatus(email.company_id, 'kontaktiert');

    this.audit.log({
      actor: 'MailAgent',
      action: 'mail.gesendet',
      summary: `E-Mail erfolgreich versendet an ${email.to_address} ("${truncate(email.subject, 60)}")`,
      entityType: 'email',
      entityId: emailId,
      detail: { provider: outcome.data.provider, messageId: outcome.data.messageId },
    });
    this.bus?.emit('invalidate', { scope: 'emails' });
    return outcome;
  }

  /** Serienversand -- ebenfalls nur mit Freigabe, und mit Abstand dazwischen. */
  async sendMany(
    emailIds: string[],
    permit: ActionPermit | null,
  ): Promise<Result<{ gesendet: string[]; fehlgeschlagen: Array<{ id: string; grund: string }> }>> {
    const check = this.approvals.verifyPermit(permit, { actionType: 'mail.bulk_senden' });
    if (!check.ok) {
      this.audit.failure('jarvis', 'mail.serienversand_verweigert', 'Serienversand ohne gültige Freigabe abgelehnt.', check.error);
      return check;
    }

    const gesendet: string[] = [];
    const fehlgeschlagen: Array<{ id: string; grund: string }> = [];

    // Die Sammelfreigabe gilt genau fuer die Liste, die im Dialog stand --
    // inklusive der Textfassung, die der Nutzer dort gesehen hat.
    const payload = this.approvals.payload(check.data);
    const freigegebeneIds = new Set(Array.isArray(payload.emailIds) ? (payload.emailIds as string[]) : []);
    const freigegebeneHashes = (payload.contentHashes ?? {}) as Record<string, string>;

    for (const [index, id] of emailIds.entries()) {
      const email = this.repos.emails.get(id);
      if (!email) {
        fehlgeschlagen.push({ id, grund: 'Entwurf nicht gefunden' });
        continue;
      }
      if (!freigegebeneIds.has(id)) {
        fehlgeschlagen.push({ id, grund: 'War nicht Teil der freigegebenen Liste' });
        continue;
      }
      if (freigegebeneHashes[id] && freigegebeneHashes[id] !== email.content_hash) {
        const grund = 'Entwurf wurde nach der Freigabe geändert';
        fehlgeschlagen.push({ id, grund });
        this.repos.emails.setStatus(id, 'entwurf', { error: grund });
        continue;
      }

      const result = await this.deliver(id);
      if (result.ok) gesendet.push(id);
      else fehlgeschlagen.push({ id, grund: result.error.message });

      this.bus?.emit('progress', {
        task: 'Serienversand',
        done: index + 1,
        total: emailIds.length,
        note: result.ok ? 'gesendet' : 'fehlgeschlagen',
      });

      const wait = this.compliance.currentLimits.minIntervalSeconds;
      if (wait > 0 && index < emailIds.length - 1) await delay(wait * 1000);
    }

    return ok({ gesendet, fehlgeschlagen });
  }

  /** Stellt mehrere Entwuerfe gemeinsam zur Freigabe. */
  requestBulkApproval(emailIds: string[], requestedBy = 'OutreachAgent'): Result<{ approvalId: string; anzahl: number }> {
    const emails = emailIds.map((id) => this.repos.emails.get(id)).filter((e): e is EmailRow => Boolean(e));
    if (emails.length === 0) return err('NOT_FOUND', 'Keiner der angegebenen Entwürfe existiert.');

    const contentHashes: Record<string, string> = {};
    for (const e of emails) contentHashes[e.id] = e.content_hash;

    const liste = emails
      .map((e, i) => `${i + 1}. ${e.to_address} — ${e.subject}`)
      .join('\n');

    const approval = this.approvals.request({
      actionType: 'mail.bulk_senden',
      title: `${emails.length} E-Mails versenden`,
      summary: `Versand von ${emails.length} Akquise-Mails freigeben?`,
      payload: { emailIds: emails.map((e) => e.id), contentHashes },
      risk: 'hoch',
      requestedBy,
      details: [
        { label: 'Anzahl', value: String(emails.length) },
        { label: 'Empfänger', value: liste, kind: 'long' },
      ],
    });

    for (const e of emails) {
      this.repos.emails.setStatus(e.id, 'wartet_auf_freigabe', { approvalId: approval.id });
      const t = this.repos.campaigns.findTargetByEmail(e.id);
      if (t) this.repos.campaigns.setTargetStatus(t.id, 'wartet_auf_freigabe');
    }
    this.bus?.emit('invalidate', { scope: 'emails' });
    return ok({ approvalId: approval.id, anzahl: emails.length });
  }

  // --- Absender -----------------------------------------------------------

  async resolveFrom(): Promise<{ name?: string | null; address: string } | null> {
    const configured = this.env.JARVIS_MAIL_FROM_ADDRESS;
    if (configured) return { name: this.env.JARVIS_MAIL_FROM_NAME ?? null, address: configured };
    const fromTransport = this.transport?.defaultFrom ? await this.transport.defaultFrom() : null;
    return fromTransport ? { name: this.env.JARVIS_MAIL_FROM_NAME ?? null, address: fromTransport } : null;
  }

  /** Hilfsfunktion fuer Tests und die Freigabepruefung. */
  static hashOf(email: Pick<EmailRow, 'to_address' | 'cc' | 'bcc' | 'subject' | 'body_text'>): string {
    return hashEmail(email);
  }
}

export function isPlausibleAddress(value: string): boolean {
  // Bewusst pragmatisch: keine RFC-5322-Vollpruefung, aber alles abfangen,
  // was offensichtlich keine Adresse ist.
  return /^[^\s@<>]+@[^\s@<>.]+(\.[^\s@<>.]+)+$/.test(value.trim());
}

function splitAddresses(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
