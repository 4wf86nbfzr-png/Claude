import { z } from 'zod/v4';
import { err, makeError, ok } from '../../shared/types.js';
import { defineTool } from './Tool.js';
import { formatDe } from '../util/id.js';

export const createEmailDraftTool = defineTool({
  name: 'create_email_draft',
  agent: 'MailAgent',
  description:
    'Legt einen E-Mail-Entwurf an. Der Entwurf wird nur gespeichert — versendet wird nichts. Für Akquise-Mails an recherchierte Unternehmen ist prepare_outreach der bessere Weg, weil dort Dublettenprüfung und Individualisierung enthalten sind.',
  schema: z.object({
    to: z.string().min(5).describe('Empfängeradresse — muss recherchiert oder vom Benutzer genannt sein'),
    subject: z.string().min(3),
    body: z.string().min(20),
    companyId: z.number().int().optional(),
    campaignId: z.number().int().optional(),
    cc: z.array(z.string()).default([]),
  }),
  summarize: (input) => `Entwurf an ${input.to}: „${input.subject}"`,
  async run(input, context) {
    const draft = context.agents.mail.createDraft({
      to: input.to,
      subject: input.subject,
      body: input.body,
      companyId: input.companyId ?? null,
      campaignId: input.campaignId ?? null,
      cc: input.cc,
    });
    if (!draft.ok) return draft;
    return ok({
      entwurfId: draft.value.id,
      empfaenger: draft.value.to,
      betreff: draft.value.subject,
      status: draft.value.status,
      hinweis: 'Gespeichert. Für den Versand ist eine ausdrückliche Freigabe des Benutzers nötig.',
    });
  },
});

export const readEmailDraftTool = defineTool({
  name: 'read_email_draft',
  agent: 'MailAgent',
  description:
    'Gibt einen Entwurf vollständig zurück (Empfänger, Betreff, Text, Anhänge, Status). Damit lässt sich der Entwurf auch vorlesen.',
  schema: z.object({
    emailId: z.number().int(),
  }),
  summarize: (input) => `Entwurf ${input.emailId} lesen`,
  async run(input, context) {
    const email = context.repos.emails.get(input.emailId);
    if (!email) return err(makeError('mail.not_found', `Entwurf ${input.emailId} existiert nicht.`));
    const company = email.companyId ? context.repos.companies.get(email.companyId) : null;
    return ok({
      entwurfId: email.id,
      unternehmen: company?.name ?? null,
      empfaenger: email.to,
      kopie: email.cc,
      betreff: email.subject,
      text: email.body,
      anhaenge: email.attachments.map((file) => file.filename),
      status: email.status,
      revision: email.revision,
      gesendetAm: formatDe(email.sentAt),
      fehler: email.errorMessage,
      vorlesetext: context.agents.mail.spokenPreview(email),
    });
  },
});

export const listEmailDraftsTool = defineTool({
  name: 'list_email_drafts',
  agent: 'MailAgent',
  description:
    'Listet E-Mails mit Nummer, Unternehmen, Empfänger, Betreff und Status. Damit lässt sich beantworten: „Zeig mir alle fertigen Entwürfe."',
  schema: z.object({
    status: z
      .enum(['entwurf', 'wartet_auf_freigabe', 'freigegeben', 'gesendet', 'fehlgeschlagen', 'alle'])
      .default('entwurf'),
    campaignId: z.number().int().optional(),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  summarize: (input) => `Entwürfe auflisten (${input.status})`,
  async run(input, context) {
    const emails = context.repos.emails.list({
      status: input.status === 'alle' ? undefined : input.status,
      campaignId: input.campaignId,
      limit: input.limit,
    });
    return ok(
      emails.map((email, index) => {
        const company = email.companyId ? context.repos.companies.get(email.companyId) : null;
        return {
          nummer: index + 1,
          entwurfId: email.id,
          unternehmen: company?.name ?? null,
          empfaenger: email.to,
          betreff: email.subject,
          status: email.status,
          gesendetAm: formatDe(email.sentAt),
        };
      }),
    );
  },
});

export const updateEmailDraftTool = defineTool({
  name: 'update_email_draft',
  agent: 'MailAgent',
  description:
    'Ändert einen Entwurf (Empfänger, Betreff, Text). Jede Änderung macht eine bereits erteilte Freigabe ungültig — danach muss erneut freigegeben werden.',
  schema: z.object({
    emailId: z.number().int(),
    to: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
  }),
  summarize: (input) => `Entwurf ${input.emailId} ändern`,
  async run(input, context) {
    const patch: Record<string, string> = {};
    if (input.to !== undefined) patch.to = input.to;
    if (input.subject !== undefined) patch.subject = input.subject;
    if (input.body !== undefined) patch.body = input.body;
    if (Object.keys(patch).length === 0) {
      return err(makeError('mail.nothing_to_change', 'Es wurde keine Änderung angegeben.'));
    }
    const updated = context.agents.mail.updateDraft(input.emailId, patch);
    if (!updated.ok) return updated;
    return ok({
      entwurfId: updated.value.id,
      revision: updated.value.revision,
      status: updated.value.status,
      hinweis: 'Geändert. Eine frühere Freigabe ist damit ungültig.',
    });
  },
});

export const requestSendApprovalTool = defineTool({
  name: 'request_send_approval',
  agent: 'MailAgent',
  description:
    'Bereitet den Versand vor: prüft Empfänger, Adressstatus, Sperrlisten, Dubletten und Versandlimits und legt dann eine Freigabeanfrage an. Es wird nichts versendet. Der Benutzer sieht Empfänger, Betreff und den vollständigen Text und muss ausdrücklich zustimmen.',
  approvalAction: 'email.send',
  schema: z.object({
    emailId: z.number().int(),
  }),
  summarize: (input) => `Freigabe für Entwurf ${input.emailId} anfordern`,
  async run(input, context) {
    const request = context.agents.mail.requestSend(input.emailId);
    if (!request.ok) return request;
    return ok({
      freigabeId: request.value.id,
      titel: request.value.title,
      angaben: request.value.facts,
      vorschau: request.value.preview,
      status: request.value.status,
      hinweis:
        'Wartet auf die Freigabe des Benutzers. Erst nach einem eindeutigen „senden"/„freigeben" darf send_email aufgerufen werden.',
    });
  },
});

export const sendEmailTool = defineTool({
  name: 'send_email',
  agent: 'MailAgent',
  description:
    'Versendet einen Entwurf — ausschließlich dann, wenn der Benutzer genau diesen Entwurf zuvor freigegeben hat. Ohne gültige, unverbrauchte Freigabe schlägt der Aufruf fehl. Rufe dieses Werkzeug niemals „auf Verdacht" auf.',
  approvalAction: 'email.send',
  schema: z.object({
    emailId: z.number().int(),
  }),
  summarize: (input) => `Entwurf ${input.emailId} versenden (nur mit Freigabe)`,
  async run(input, context) {
    context.status('Sende …');
    const sent = await context.agents.mail.sendApproved(input.emailId);
    if (!sent.ok) return sent;
    return ok({
      entwurfId: sent.value.id,
      empfaenger: sent.value.to,
      status: sent.value.status,
      messageId: sent.value.messageId,
      gesendetAm: formatDe(sent.value.sentAt),
    });
  },
});

export const requestBulkSendApprovalTool = defineTool({
  name: 'request_bulk_send_approval',
  agent: 'MailAgent',
  description:
    'Fordert Freigaben für mehrere Entwürfe an. Es entsteht eine Freigabe pro Nachricht — es gibt bewusst keinen Sammelversand mit einem einzigen Klick.',
  approvalAction: 'email.send_bulk',
  schema: z.object({
    emailIds: z.array(z.number().int()).min(1).max(50),
  }),
  summarize: (input) => `Freigaben für ${input.emailIds.length} Entwürfe anfordern`,
  async run(input, context) {
    const result = context.agents.mail.requestBulkSend(input.emailIds);
    return ok({
      angefragt: result.requested.length,
      blockiert: result.blocked.map((entry) => ({
        entwurfId: entry.id,
        grund: entry.error.message,
      })),
      hinweis: 'Jede Nachricht muss einzeln freigegeben werden.',
    });
  },
});

export const checkRepliesTool = defineTool({
  name: 'check_replies',
  agent: 'MailAgent',
  description:
    'Liest den Posteingang über IMAP und ordnet Antworten den versendeten Nachrichten und Unternehmen zu.',
  schema: z.object({
    sinceDays: z.number().int().min(1).max(180).default(30),
  }),
  summarize: (input) => `Antworten der letzten ${input.sinceDays} Tage prüfen`,
  async run(input, context) {
    context.status('Prüfe Posteingang …');
    const result = await context.agents.mail.matchReplies(input.sinceDays);
    if (!result.ok) return result;
    return ok({ gelesen: result.value.scanned, zugeordnet: result.value.matched });
  },
});

export const listApprovalsTool = defineTool({
  name: 'list_pending_approvals',
  agent: 'ApprovalService',
  description: 'Zeigt alle offenen Freigabeanfragen mit ihren Angaben.',
  schema: z.object({}),
  summarize: () => 'Offene Freigaben anzeigen',
  async run(_input, context) {
    const open = context.services.approvals.listOpen();
    return ok(
      open.map((request) => ({
        freigabeId: request.id,
        aktion: request.action,
        titel: request.title,
        objekt: request.subject,
        angefragtAm: formatDe(request.requestedAt),
        laeuftAbAm: formatDe(request.expiresAt),
      })),
    );
  },
});
