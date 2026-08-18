import { z } from 'zod';
import { basename } from 'node:path';
import { stat } from 'node:fs/promises';
import { defineTool, type AnyTool } from './types.js';
import { err, ok } from '../util/result.js';
import { truncate } from '../util/text.js';
import { EMAIL_STATUS } from '../db/schema.js';

/**
 * Mail-Werkzeuge.
 *
 * `send_email` gibt es hier bewusst *nicht* als frei aufrufbares Tool.
 * Der einzige Weg zum Versand fuehrt ueber `request_send_approval` und die
 * anschliessende Bestaetigung des Benutzers. Waere der Versand ein normales
 * Tool, koennte das Modell ihn selbst ausloesen -- genau das soll nicht sein.
 */

export const createEmailDraftTool = defineTool({
  name: 'create_email_draft',
  description:
    'Legt einen E-Mail-Entwurf an. Versendet nichts. Liefert die Entwurfskennung zurück, mit der der Entwurf gelesen, geändert und zur Freigabe gestellt werden kann.',
  category: 'mail',
  readOnly: false,
  input: z.object({
    an: z.string().describe('Empfängeradresse.'),
    betreff: z.string().min(1),
    text: z.string().min(1).describe('Vollständiger Mailtext inklusive Anrede und Grußformel.'),
    anName: z.string().optional(),
    kopie: z.array(z.string()).optional(),
    firmaId: z.string().optional(),
    kampagneId: z.string().optional(),
    antwortAuf: z.string().optional().describe('Message-ID, falls es eine Antwort ist.'),
  }),
  handler: async (input, ctx) => {
    const r = await ctx.mail.createDraft({
      to: input.an,
      subject: input.betreff,
      body: input.text,
      toName: input.anName ?? null,
      ...(input.kopie ? { cc: input.kopie } : {}),
      companyId: input.firmaId ?? null,
      campaignId: input.kampagneId ?? null,
      inReplyTo: input.antwortAuf ?? null,
    });
    if (!r.ok) return r;
    return ok({
      entwurfId: r.data.email.id,
      an: r.data.email.to_address,
      betreff: r.data.email.subject,
      status: EMAIL_STATUS[r.data.email.status],
      warnungen: r.data.warnungen,
      hinweis: 'Der Entwurf ist gespeichert. Ein Versand findet erst nach ausdrücklicher Freigabe durch den Benutzer statt.',
    });
  },
  summarize: (input, result) =>
    result.ok ? `Entwurf an ${input.an} erstellt` : `Entwurf fehlgeschlagen: ${result.error.message}`,
});

export const readEmailDraftTool = defineTool({
  name: 'read_email_draft',
  description: 'Liest einen E-Mail-Entwurf vollständig: Empfänger, Betreff, Text, Status und offene Warnungen.',
  category: 'mail',
  readOnly: true,
  input: z.object({ entwurfId: z.string() }),
  handler: async (input, ctx) => {
    const r = ctx.mail.get(input.entwurfId);
    if (!r.ok) return r;
    const e = r.data.email;
    const firma = e.company_id ? ctx.repos.companies.get(e.company_id) : undefined;
    return ok({
      entwurfId: e.id,
      firma: firma?.name ?? null,
      an: e.to_address,
      anName: e.to_name,
      kopie: e.cc,
      betreff: e.subject,
      text: e.body_text,
      status: EMAIL_STATUS[e.status],
      warnungen: r.data.warnungen,
      anhaenge: r.data.anhaenge.map((a) => a.filename),
      zuletztGeaendert: e.updated_at,
    });
  },
  summarize: (input, result) => (result.ok ? `Entwurf ${input.entwurfId} gelesen` : result.error.message),
});

export const updateEmailDraftTool = defineTool({
  name: 'update_email_draft',
  description:
    'Ändert einen Entwurf (Empfänger, Betreff oder Text). Eine bereits erteilte Freigabe verfällt dadurch automatisch und muss neu eingeholt werden.',
  category: 'mail',
  readOnly: false,
  input: z.object({
    entwurfId: z.string(),
    an: z.string().optional(),
    betreff: z.string().optional(),
    text: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const patch: { to?: string; subject?: string; body?: string } = {};
    if (input.an) patch.to = input.an;
    if (input.betreff) patch.subject = input.betreff;
    if (input.text) patch.body = input.text;
    if (Object.keys(patch).length === 0) {
      return err('INVALID_INPUT', 'Es wurde nichts angegeben, was geändert werden soll.');
    }
    const r = ctx.mail.updateDraft(input.entwurfId, patch);
    if (!r.ok) return r;
    return ok({
      entwurfId: r.data.email.id,
      betreff: r.data.email.subject,
      status: EMAIL_STATUS[r.data.email.status],
      warnungen: r.data.warnungen,
      hinweis: 'Der Entwurf wurde geändert. Eine frühere Freigabe gilt damit nicht mehr.',
    });
  },
  summarize: (input, result) => (result.ok ? `Entwurf ${input.entwurfId} geändert` : result.error.message),
});

export const listEmailDraftsTool = defineTool({
  name: 'list_email_drafts',
  description: 'Listet E-Mail-Entwürfe, wahlweise gefiltert nach Status oder Kampagne. Für "zeig mir alle fertigen Entwürfe".',
  category: 'mail',
  readOnly: true,
  input: z.object({
    status: z
      .enum(['entwurf', 'wartet_auf_freigabe', 'freigegeben', 'gesendet', 'fehlgeschlagen'])
      .optional(),
    kampagneId: z.string().optional(),
    anzahl: z.number().int().min(1).max(200).optional(),
  }),
  handler: async (input, ctx) => {
    const rows = ctx.repos.emails.list({
      ...(input.status ? { status: input.status } : {}),
      ...(input.kampagneId ? { campaignId: input.kampagneId } : {}),
      limit: input.anzahl ?? 50,
    });
    return ok({
      anzahl: rows.length,
      entwuerfe: rows.map((e, i) => ({
        nummer: i + 1,
        entwurfId: e.id,
        firma: e.company_id ? (ctx.repos.companies.get(e.company_id)?.name ?? null) : null,
        an: e.to_address,
        betreff: e.subject,
        status: EMAIL_STATUS[e.status],
        erstelltAm: e.created_at,
        fehler: e.error,
      })),
    });
  },
  summarize: (_input, result) => (result.ok ? `${(result.data as { anzahl: number }).anzahl} Entwürfe gelistet` : result.error.message),
});

export const readDraftAloudTool = defineTool({
  name: 'read_draft_aloud',
  description:
    'Bereitet einen Entwurf zum Vorlesen auf (Empfänger, Betreff, Text in dieser Reihenfolge) und gibt ihn an die Sprachausgabe.',
  category: 'mail',
  readOnly: true,
  input: z.object({ entwurfId: z.string() }),
  handler: async (input, ctx) => {
    const r = ctx.mail.spokenVersion(input.entwurfId);
    if (!r.ok) return r;
    ctx.bus.emit('speak', { text: r.data, interrupt: true });
    return ok({ vorgelesen: true, text: r.data });
  },
  summarize: (input, result) => (result.ok ? `Entwurf ${input.entwurfId} vorgelesen` : result.error.message),
});

export const addAttachmentTool = defineTool({
  name: 'add_email_attachment',
  description: 'Hängt eine lokale Datei an einen Entwurf an. Die Datei muss in einem freigegebenen Verzeichnis liegen.',
  category: 'mail',
  readOnly: false,
  input: z.object({ entwurfId: z.string(), dateipfad: z.string() }),
  handler: async (input, ctx) => {
    const draft = ctx.repos.emails.get(input.entwurfId);
    if (!draft) return err('NOT_FOUND', `Entwurf ${input.entwurfId} existiert nicht.`);
    if (draft.status === 'gesendet') return err('INVALID_INPUT', 'Diese Mail wurde bereits gesendet.');

    const safe = ctx.system.resolveSafePath(input.dateipfad);
    if (!safe.ok) return safe;
    let size = 0;
    try {
      const s = await stat(safe.data);
      if (!s.isFile()) return err('INVALID_INPUT', 'Der Pfad zeigt nicht auf eine Datei.');
      size = s.size;
    } catch {
      return err('NOT_FOUND', `Die Datei "${safe.data}" existiert nicht.`);
    }
    if (size > 20_000_000) {
      return err('INVALID_INPUT', 'Anhänge über 20 MB werden von den meisten Postfächern abgelehnt.');
    }

    const row = ctx.repos.emails.addAttachment({
      emailId: input.entwurfId,
      filename: basename(safe.data),
      path: safe.data,
      sizeBytes: size,
    });
    ctx.bus.emit('invalidate', { scope: 'emails' });
    return ok({ anhangId: row.id, dateiname: row.filename, groesseBytes: size });
  },
});

export const requestSendApprovalTool = defineTool({
  name: 'request_send_approval',
  description:
    'Stellt einen Entwurf dem Benutzer zur Freigabe. Zeigt ihm Empfänger, Betreff und den vollständigen Text. Der Versand erfolgt erst, wenn der Benutzer ausdrücklich zustimmt — dieses Tool versendet nichts.',
  category: 'mail',
  readOnly: false,
  input: z.object({ entwurfId: z.string() }),
  handler: async (input, ctx) => {
    const r = ctx.mail.requestSendApproval(input.entwurfId, ctx.agent);
    if (!r.ok) return r;
    const firma = r.data.email.company_id ? ctx.repos.companies.get(r.data.email.company_id) : undefined;
    return ok({
      freigabeId: r.data.approvalId,
      status: 'Wartet auf Freigabe',
      empfaenger: r.data.email.to_address,
      firma: firma?.name ?? null,
      betreff: r.data.email.subject,
      hinweis:
        `Der Entwurf liegt dem Benutzer zur Freigabe vor. Frage ihn jetzt: "Versand an ${r.data.email.to_address} freigeben?" ` +
        'Ohne eindeutige Zustimmung passiert nichts.',
    });
  },
  summarize: (input, result) =>
    result.ok ? `Freigabe angefragt für Entwurf ${input.entwurfId}` : `Freigabeanfrage fehlgeschlagen: ${result.error.message}`,
});

export const requestBulkSendApprovalTool = defineTool({
  name: 'request_bulk_send_approval',
  description:
    'Stellt mehrere Entwürfe gemeinsam zur Freigabe. Auch hier wird nichts versendet, bevor der Benutzer die Liste ausdrücklich bestätigt hat.',
  category: 'mail',
  readOnly: false,
  input: z.object({ entwurfIds: z.array(z.string()).min(1).max(200) }),
  handler: async (input, ctx) => {
    const r = ctx.mail.requestBulkApproval(input.entwurfIds, ctx.agent);
    if (!r.ok) return r;
    return ok({
      freigabeId: r.data.approvalId,
      anzahl: r.data.anzahl,
      status: 'Wartet auf Freigabe',
      hinweis: `Die Liste mit ${r.data.anzahl} Mails liegt dem Benutzer zur Freigabe vor. Ohne Bestätigung wird nichts versendet.`,
    });
  },
});

export const mailStatusTool = defineTool({
  name: 'mail_transport_status',
  description: 'Zeigt, welcher Versandweg eingerichtet ist und ob er benutzbar wäre.',
  category: 'mail',
  readOnly: true,
  input: z.object({}),
  handler: async (_input, ctx) => {
    const status = ctx.mail.transportStatus();
    const absender = await ctx.mail.resolveFrom();
    return ok({ ...status, absender: absender?.address ?? null });
  },
});

export const checkRepliesTool = defineTool({
  name: 'check_email_replies',
  description:
    'Holt neue Nachrichten aus dem Posteingang (IMAP) und ordnet Antworten den angeschriebenen Unternehmen zu.',
  category: 'mail',
  readOnly: false,
  input: z.object({ seitTagen: z.number().int().min(1).max(90).optional() }),
  handler: async (input, ctx) => {
    if (!ctx.mailReader) {
      return err('NOT_CONFIGURED', 'Es ist kein Posteingang eingerichtet.', {
        hint: 'IMAP_HOST, IMAP_USER und IMAP_PASSWORD hinterlegen.',
      });
    }
    if (!ctx.mailReader.isConfigured()) {
      return err('NOT_CONFIGURED', ctx.mailReader.missingConfigHint() ?? 'IMAP ist unvollständig eingerichtet.');
    }

    const tage = input.seitTagen ?? 14;
    const since = new Date(Date.now() - tage * 86_400_000);
    const result = await ctx.mailReader.fetchSince(since, 100);
    if (!result.ok) return result;

    const zugeordnet: Array<{ von: string; betreff: string; firma: string | null }> = [];
    let neu = 0;

    for (const msg of result.data) {
      if (msg.messageId && ctx.repos.emails.existsMessageId(msg.messageId)) continue;
      neu += 1;

      // Zuordnung: erst ueber In-Reply-To, sonst ueber die Absenderdomain.
      let firmaId: string | null = null;
      if (msg.inReplyTo) {
        const original = ctx.repos.emails
          .list({ limit: 500 })
          .find((e) => e.message_id && msg.inReplyTo?.includes(e.message_id));
        firmaId = original?.company_id ?? null;
      }
      if (!firmaId) {
        const adresse = ctx.repos.companies.findEmailAddress(msg.from);
        firmaId = adresse?.company_id ?? null;
      }
      if (!firmaId) {
        const { domainOfEmail } = await import('../util/text.js');
        const d = domainOfEmail(msg.from);
        if (d) firmaId = ctx.repos.companies.findByDomain(d)?.id ?? null;
      }

      const row = ctx.repos.emails.recordIncoming({
        fromAddress: msg.from,
        subject: msg.subject,
        bodyText: truncate(msg.text, 20_000),
        receivedAt: msg.date,
        messageId: msg.messageId,
        inReplyTo: msg.inReplyTo,
        companyId: firmaId,
      });

      const firma = firmaId ? ctx.repos.companies.get(firmaId) : undefined;
      if (firmaId) {
        ctx.repos.emails.addInteraction({
          companyId: firmaId,
          emailId: row.id,
          kind: 'mail',
          direction: 'eingehend',
          summary: `Antwort erhalten: "${truncate(msg.subject, 80)}"`,
          occurredAt: msg.date,
        });
        const ziel = ctx.repos.campaigns
          .overview({})
          .find((z) => z.target.company_id === firmaId && z.target.status === 'gesendet');
        if (ziel) ctx.repos.campaigns.setTargetStatus(ziel.target.id, 'antwort_erhalten');
      }
      zugeordnet.push({ von: msg.from, betreff: msg.subject, firma: firma?.name ?? null });
    }

    ctx.bus.emit('invalidate', { scope: 'emails' });
    ctx.audit.log({
      actor: ctx.agent,
      action: 'mail.posteingang',
      summary: `Posteingang geprüft: ${neu} neue Nachricht(en) der letzten ${tage} Tage`,
      detail: { zugeordnet: zugeordnet.filter((z) => z.firma).length },
    });
    return ok({ geprueftSeit: since.toISOString(), neueNachrichten: neu, nachrichten: zugeordnet });
  },
});

export const mailTools: AnyTool[] = [
  createEmailDraftTool,
  readEmailDraftTool,
  updateEmailDraftTool,
  listEmailDraftsTool,
  readDraftAloudTool,
  addAttachmentTool,
  requestSendApprovalTool,
  requestBulkSendApprovalTool,
  mailStatusTool,
  checkRepliesTool,
];
