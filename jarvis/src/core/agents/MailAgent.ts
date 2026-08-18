import { basename } from 'node:path';
import { statSync } from 'node:fs';
import type {
  ApprovalRequest,
  AppSettings,
  EmailAttachment,
  EmailRecord,
  JarvisError,
  Result,
} from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { CompanyRepository } from '../db/repositories/companies.js';
import type { DraftInput, EmailRepository } from '../db/repositories/emails.js';
import type { ApprovalService } from '../services/ApprovalService.js';
import type { AuditLogService } from '../services/AuditLogService.js';
import type { ComplianceService } from '../services/ComplianceService.js';
import type { CredentialService } from '../services/CredentialService.js';
import type { SettingsService } from '../services/SettingsService.js';
import { createMailReader, createMailTransport } from '../mail/factory.js';
import type { MailReader, MailTransport, OutgoingMessage } from '../mail/types.js';
import { fingerprint, formatDe } from '../util/id.js';

export interface MailAgentDeps {
  emails: EmailRepository;
  companies: CompanyRepository;
  approvals: ApprovalService;
  audit: AuditLogService;
  compliance: ComplianceService;
  settings: SettingsService;
  credentials: CredentialService;
  /**
   * Overridable so tests can supply a transport that records instead of
   * sending. Production leaves these unset and gets the real factories.
   */
  transportFactory?: () => Result<MailTransport, JarvisError>;
  readerFactory?: () => Result<MailReader, JarvisError>;
}

/**
 * Owns everything that touches e-mail (§3).
 *
 * The one rule this class exists to enforce: `sendApproved()` is the only
 * method that calls a transport, and its first statement claims an approval.
 * There is no other path to a transport in the codebase — `requestSend()`
 * merely creates the approval request and returns.
 */
export class MailAgent {
  readonly name = 'MailAgent';

  constructor(private readonly deps: MailAgentDeps) {}

  private transport(): Result<MailTransport, JarvisError> {
    return this.deps.transportFactory
      ? this.deps.transportFactory()
      : createMailTransport(this.deps.settings.get(), this.deps.credentials);
  }

  private reader(): Result<MailReader, JarvisError> {
    return this.deps.readerFactory
      ? this.deps.readerFactory()
      : createMailReader(this.deps.settings.get(), this.deps.credentials);
  }

  /* ---------------------------------------------------------------- */
  /* Drafting                                                          */
  /* ---------------------------------------------------------------- */

  createDraft(input: DraftInput): Result<EmailRecord, JarvisError> {
    const settings = this.deps.settings.get();

    const recipientCheck = this.deps.compliance.checkRecipient(
      input.to,
      input.companyId ?? null,
      settings.compliance,
    );
    if (!recipientCheck.ok) return recipientCheck;

    if (!input.subject.trim()) {
      return err(makeError('mail.no_subject', 'Ein Entwurf braucht einen Betreff.'));
    }
    if (!input.body.trim()) {
      return err(makeError('mail.no_body', 'Ein Entwurf braucht einen Text.'));
    }

    const attachments = this.resolveAttachments(input.attachments ?? []);
    if (!attachments.ok) return attachments;

    const draft = this.deps.emails.createDraft({ ...input, attachments: attachments.value });
    if (draft.companyId) {
      this.deps.companies.setStatus(draft.companyId, 'Entwurf erstellt');
    }
    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: 'entwurf.erstellt',
      subject: `email:${draft.id}`,
      outcome: 'ok',
      detail: `An ${draft.to} — „${draft.subject}"`,
    });
    return ok(draft);
  }

  updateDraft(
    id: number,
    patch: Partial<Pick<EmailRecord, 'to' | 'subject' | 'body' | 'cc' | 'bcc'>>,
  ): Result<EmailRecord, JarvisError> {
    const current = this.deps.emails.get(id);
    if (!current) return err(makeError('mail.not_found', `Entwurf ${id} existiert nicht.`));
    if (current.status === 'gesendet') {
      return err(
        makeError('mail.already_sent', 'Eine bereits versendete Nachricht kann nicht mehr geändert werden.'),
      );
    }
    if (patch.to) {
      const check = this.deps.compliance.checkRecipient(
        patch.to,
        current.companyId ?? null,
        this.deps.settings.get().compliance,
      );
      if (!check.ok) return check;
    }
    const updated = this.deps.emails.update(id, patch);
    if (!updated) return err(makeError('mail.update_failed', `Entwurf ${id} konnte nicht geändert werden.`));

    this.deps.audit.log({
      actor: 'benutzer',
      agent: this.name,
      action: 'entwurf.geaendert',
      subject: `email:${id}`,
      outcome: 'ok',
      detail: `Revision ${updated.revision}; eine bestehende Freigabe wurde damit ungültig.`,
    });
    return ok(updated);
  }

  addAttachment(id: number, path: string): Result<EmailRecord, JarvisError> {
    const current = this.deps.emails.get(id);
    if (!current) return err(makeError('mail.not_found', `Entwurf ${id} existiert nicht.`));
    const resolved = this.resolveAttachments([{ filename: basename(path), path }]);
    if (!resolved.ok) return resolved;
    const updated = this.deps.emails.update(id, {
      attachments: [...current.attachments, ...resolved.value],
    });
    return updated ? ok(updated) : err(makeError('mail.update_failed', 'Anhang konnte nicht ergänzt werden.'));
  }

  private resolveAttachments(
    attachments: EmailAttachment[],
  ): Result<EmailAttachment[], JarvisError> {
    const resolved: EmailAttachment[] = [];
    for (const attachment of attachments) {
      try {
        const stats = statSync(attachment.path);
        if (!stats.isFile()) {
          return err(makeError('mail.attachment_missing', `${attachment.path} ist keine Datei.`));
        }
        if (stats.size > 20 * 1024 * 1024) {
          return err(
            makeError(
              'mail.attachment_too_large',
              `${basename(attachment.path)} ist ${(stats.size / 1024 / 1024).toFixed(1)} MB groß — die meisten Server lehnen über 20 MB ab.`,
            ),
          );
        }
        resolved.push({
          filename: attachment.filename || basename(attachment.path),
          path: attachment.path,
          size: stats.size,
        });
      } catch {
        return err(
          makeError('mail.attachment_missing', `Die Datei ${attachment.path} wurde nicht gefunden.`),
        );
      }
    }
    return ok(resolved);
  }

  /* ---------------------------------------------------------------- */
  /* Preview / reading aloud                                           */
  /* ---------------------------------------------------------------- */

  /** The exact text the user must see or hear before approving (§2). */
  preview(email: EmailRecord): string {
    const lines = [
      `Empfänger: ${email.to}`,
      email.cc?.length ? `Kopie: ${email.cc.join(', ')}` : null,
      `Betreff: ${email.subject}`,
      email.attachments.length
        ? `Anhänge: ${email.attachments.map((file) => file.filename).join(', ')}`
        : null,
      '',
      email.body,
    ].filter((line): line is string => line !== null);
    return lines.join('\n');
  }

  /** Same content, phrased for text-to-speech. */
  spokenPreview(email: EmailRecord): string {
    const company = email.companyId ? this.deps.companies.get(email.companyId) : null;
    return [
      `Entwurf ${email.id}${company ? ` für ${company.name}` : ''}.`,
      `Empfänger ${speakAddress(email.to)}.`,
      `Betreff: ${email.subject}.`,
      'Text:',
      email.body,
    ].join(' ');
  }

  /**
   * Content fingerprint. Everything a human would judge goes in, so any edit
   * invalidates a previously granted approval.
   */
  fingerprintOf(email: EmailRecord): string {
    return fingerprint(
      email.id,
      email.to,
      (email.cc ?? []).join(','),
      (email.bcc ?? []).join(','),
      email.subject,
      email.body,
      email.attachments.map((file) => `${file.filename}:${file.size ?? 0}`).join('|'),
    );
  }

  /* ---------------------------------------------------------------- */
  /* Approval                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Prepares the send. Runs every compliance check first so the user is never
   * asked to approve something that would fail anyway, then creates the
   * approval request. It does not send.
   */
  requestSend(id: number): Result<ApprovalRequest, JarvisError> {
    const email = this.deps.emails.get(id);
    if (!email) return err(makeError('mail.not_found', `Entwurf ${id} existiert nicht.`));

    const settings = this.deps.settings.get();

    const transport = this.transport();
    if (!transport.ok) return transport;

    const guard = this.deps.compliance.checkSend({ email, settings: settings.compliance });
    if (!guard.ok) {
      this.deps.audit.log({
        actor: 'system',
        agent: this.name,
        action: 'versand.blockiert',
        subject: `email:${id}`,
        outcome: 'abgelehnt',
        detail: `${guard.error.code}: ${guard.error.message}`,
      });
      return guard;
    }

    const company = email.companyId ? this.deps.companies.get(email.companyId) : null;
    const addressRecord = email.companyId
      ? this.deps.companies
          .emailAddresses(email.companyId)
          .find((candidate) => candidate.address.toLowerCase() === email.to.toLowerCase())
      : undefined;

    const request = this.deps.approvals.request({
      action: 'email.send',
      title: `E-Mail an ${company?.name ?? email.to} senden`,
      subject: `email:${id}`,
      fingerprint: this.fingerprintOf(email),
      facts: [
        { label: 'Aktion', value: 'E-Mail versenden' },
        { label: 'Empfänger', value: email.to },
        { label: 'Unternehmen', value: company?.name ?? '—' },
        {
          label: 'Adressstatus',
          value: addressRecord ? `${addressRecord.status} — ${addressRecord.reason}` : 'manuell eingetragen',
        },
        { label: 'Quelle', value: addressRecord?.sourceUrl ?? '—' },
        { label: 'Betreff', value: email.subject },
        { label: 'Versandweg', value: transport.value.name },
        { label: 'Absender', value: `${settings.mail.identity.name} <${settings.mail.identity.email}>` },
        {
          label: 'Anhänge',
          value: email.attachments.length
            ? email.attachments.map((file) => file.filename).join(', ')
            : 'keine',
        },
        { label: 'Letzter Kontakt', value: formatDe(company?.lastContactAt) },
      ],
      preview: this.preview(email),
    });

    this.deps.emails.setStatus(id, 'wartet_auf_freigabe');
    if (email.companyId) this.deps.companies.setStatus(email.companyId, 'Wartet auf Freigabe');
    return ok(request);
  }

  /**
   * Bulk preparation. One approval per mail — there is deliberately no single
   * switch that releases many messages at once (§17).
   */
  requestBulkSend(ids: number[]): { requested: ApprovalRequest[]; blocked: Array<{ id: number; error: JarvisError }> } {
    const requested: ApprovalRequest[] = [];
    const blocked: Array<{ id: number; error: JarvisError }> = [];
    for (const id of ids) {
      const result = this.requestSend(id);
      if (result.ok) requested.push(result.value);
      else blocked.push({ id, error: result.error });
    }
    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: 'sammelfreigabe.angefragt',
      outcome: 'info',
      detail: `${requested.length} Freigaben angefragt, ${blocked.length} blockiert.`,
    });
    return { requested, blocked };
  }

  /* ---------------------------------------------------------------- */
  /* Sending — the only path to a transport                            */
  /* ---------------------------------------------------------------- */

  async sendApproved(id: number): Promise<Result<EmailRecord, JarvisError>> {
    const email = this.deps.emails.get(id);
    if (!email) return err(makeError('mail.not_found', `Entwurf ${id} existiert nicht.`));

    // 1. The gate. Fails when no approval exists, it was rejected, it expired,
    //    it was already spent, or the text changed after it was granted.
    const claim = this.deps.approvals.claim(`email:${id}`, this.fingerprintOf(email));
    if (!claim.ok) return claim;

    const settings = this.deps.settings.get();

    // 2. Compliance again — state may have changed since the request.
    const guard = this.deps.compliance.checkSend({ email, settings: settings.compliance });
    if (!guard.ok) {
      this.deps.emails.markFailed(id, guard.error.code, guard.error.message);
      this.deps.audit.log({
        actor: 'system',
        agent: this.name,
        action: 'versand.blockiert',
        subject: `email:${id}`,
        outcome: 'abgelehnt',
        detail: guard.error.message,
      });
      return guard;
    }

    const transport = this.transport();
    if (!transport.ok) {
      this.deps.emails.markFailed(id, transport.error.code, transport.error.message);
      return transport;
    }

    const message: OutgoingMessage = {
      from: { name: settings.mail.identity.name, address: settings.mail.identity.email },
      replyTo: settings.mail.identity.replyTo,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      subject: email.subject,
      text: withSignature(email.body, settings),
      attachments: email.attachments.map((file) => ({ filename: file.filename, path: file.path })),
    };

    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: 'versand.gestartet',
      subject: `email:${id}`,
      outcome: 'info',
      detail: `${transport.value.name} → ${email.to}`,
    });

    const receipt = await transport.value.send(message);

    if (!receipt.ok) {
      // §19: a failed send is reported as failed, never dressed up.
      this.deps.emails.markFailed(id, receipt.error.code, receipt.error.message);
      this.deps.emails.logSend(id, email.to, 'fehler');
      if (email.companyId) this.deps.companies.setStatus(email.companyId, 'Fehler');
      this.deps.audit.log({
        actor: 'jarvis',
        agent: this.name,
        action: 'versand.fehlgeschlagen',
        subject: `email:${id}`,
        outcome: 'fehler',
        detail: `${receipt.error.code}: ${receipt.error.message}${
          receipt.error.detail ? ` — ${receipt.error.detail}` : ''
        }`,
      });
      return receipt;
    }

    this.deps.emails.markSent(id, receipt.value.messageId);
    this.deps.emails.logSend(id, email.to, 'ok');
    this.deps.emails.addInteraction({
      companyId: email.companyId,
      contactId: email.contactId,
      emailId: id,
      direction: 'out',
      summary: `E-Mail „${email.subject}" an ${email.to} versendet.`,
    });
    if (email.companyId) {
      this.deps.companies.markContacted(email.companyId);
      this.deps.companies.setStatus(email.companyId, 'Gesendet');
    }
    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: 'versand.erfolgreich',
      subject: `email:${id}`,
      outcome: 'ok',
      detail: `Message-Id ${receipt.value.messageId || '(nicht gemeldet)'} — ${receipt.value.response}`,
    });

    return ok(this.deps.emails.get(id)!);
  }

  /* ---------------------------------------------------------------- */
  /* Replies                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Reads the inbox and links replies back to the sent message and company
   * (§3). Matching is by In-Reply-To/References first, then by sender address.
   */
  async matchReplies(sinceDays = 30): Promise<Result<{ scanned: number; matched: number }, JarvisError>> {
    const settings = this.deps.settings.get();
    const reader = this.reader();
    if (!reader.ok) return reader;

    const since = new Date(Date.now() - sinceDays * 86400 * 1000).toISOString();
    const messages = await reader.value.fetchRecent(since, 200);
    if (!messages.ok) return messages;

    let matched = 0;
    for (const incoming of messages.value) {
      const references = [incoming.inReplyTo, ...incoming.references].filter(
        (value): value is string => Boolean(value),
      );
      let target: EmailRecord | null = null;
      for (const reference of references) {
        target = this.deps.emails.findByMessageId(reference);
        if (target) break;
      }
      if (!target && incoming.from) {
        const sent = this.deps.emails
          .list({ status: 'gesendet', limit: 500 })
          .find((candidate) => candidate.to.toLowerCase() === incoming.from.toLowerCase());
        target = sent ?? null;
      }
      if (!target) continue;

      if (!target.repliedAt) {
        this.deps.emails.markReplied(target.id, incoming.date);
        this.deps.emails.addInteraction({
          companyId: target.companyId,
          emailId: target.id,
          direction: 'in',
          summary: `Antwort von ${incoming.from}: „${incoming.subject}"`,
          occurredAt: incoming.date,
        });
        if (target.companyId) this.deps.companies.setStatus(target.companyId, 'Antwort erhalten');
        this.deps.audit.log({
          actor: 'jarvis',
          agent: this.name,
          action: 'antwort.zugeordnet',
          subject: `email:${target.id}`,
          outcome: 'ok',
          detail: `${incoming.from} — ${incoming.subject}`,
        });
        matched += 1;
      }
    }
    return ok({ scanned: messages.value.length, matched });
  }

  async verifyTransport(): Promise<Result<string, JarvisError>> {
    const transport = this.transport();
    if (!transport.ok) return transport;
    return transport.value.verify();
  }
}

/** Appends the configured signature unless the body already carries one. */
function withSignature(body: string, settings: AppSettings): string {
  const signature = settings.mail.identity.signature?.trim();
  if (!signature) return body;
  if (body.includes(signature)) return body;
  return `${body.trimEnd()}\n\n-- \n${signature}`;
}

/** Makes an address readable by a speech synthesiser. */
function speakAddress(address: string): string {
  return address.replaceAll('@', ' at ').replaceAll('.', ' Punkt ').replaceAll('-', ' Bindestrich ');
}
