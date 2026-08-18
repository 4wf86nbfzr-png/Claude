import { z } from 'zod';
import { EmailStatus, OutreachStatus, VerificationStatus } from '../../../shared/status';
import type { EmailRecord } from '../../../shared/types';
import { ueberarbeiteMail } from '../../agents/composer';
import { SystemService } from '../../services/system';
import { normalizeEmail, truncate } from '../../util/text';
import { fail, ok, type ToolContext, type ToolDefinition } from '../types';

/** Vollständige Vorschau, wie sie §2 vor jeder Freigabe verlangt. */
export function vorschau(email: EmailRecord): string {
  return [
    `An: ${email.toAddresses.join(', ')}`,
    email.cc.length ? `Kopie: ${email.cc.join(', ')}` : null,
    email.bcc.length ? `Blindkopie: ${email.bcc.join(', ')}` : null,
    `Betreff: ${email.subject}`,
    email.attachments.length ? `Anhänge: ${email.attachments.map((a) => a.filename).join(', ')}` : null,
    '',
    email.bodyText
  ]
    .filter((zeile) => zeile !== null)
    .join('\n');
}

const createSchema = z.object({
  to: z.array(z.string()).min(1).describe('Empfängeradressen – bei Akquise genau eine'),
  subject: z.string().min(1).describe('Betreffzeile'),
  bodyText: z.string().min(1).describe('Mailtext als reiner Text'),
  companyId: z.number().int().optional().describe('Zugehöriges Unternehmen aus der Datenbank'),
  contactId: z.number().int().optional().describe('Zugehöriger Ansprechpartner'),
  campaignId: z.number().int().optional().describe('Zugehörige Kampagne'),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional()
});

const createEmailDraft: ToolDefinition = {
  name: 'create_email_draft',
  agent: 'MailAgent',
  description:
    'Legt einen E-Mail-Entwurf an. Sendet nichts. Prüft vorab Sperrliste und Verifizierungsgrad der Empfänger und ' +
    'weist auf bereits erfolgte Kontakte hin.',
  schema: createSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof createSchema>;
    const empfaenger = daten.to.map(normalizeEmail);

    for (const adresse of empfaenger) {
      const gesperrt = context.repos.suppression.blocks(adresse);
      if (gesperrt) {
        return fail(
          `${adresse} steht auf der Sperrliste${gesperrt.reason ? ` (${gesperrt.reason})` : ''}. Es wird kein Entwurf angelegt.`
        );
      }
    }

    const entwurf = context.repos.emails.createDraft({
      to: empfaenger,
      cc: daten.cc ?? [],
      bcc: daten.bcc ?? [],
      subject: daten.subject,
      bodyText: daten.bodyText,
      companyId: daten.companyId ?? null,
      contactId: daten.contactId ?? null,
      campaignId: daten.campaignId ?? null,
      fromAddress: context.config.mail.fromAddress || null
    });

    const pruefung = context.mail.vorpruefung(entwurf);
    if (daten.campaignId && daten.companyId) {
      context.repos.campaigns.setTargetStatus(daten.campaignId, daten.companyId, OutreachStatus.ENTWURF_ERSTELLT, {
        emailId: entwurf.id
      });
    }
    return ok(`Entwurf ${entwurf.id} an ${empfaenger.join(', ')} angelegt.`, {
      emailId: entwurf.id,
      status: entwurf.status,
      vorschau: vorschau(entwurf),
      hindernisse: pruefung.hindernisse,
      hinweise: pruefung.hinweise
    });
  }
};

const readSchema = z.object({
  emailId: z.number().int().describe('Nummer des Entwurfs')
});

const readEmailDraft: ToolDefinition = {
  name: 'read_email_draft',
  agent: 'MailAgent',
  description:
    'Gibt einen Entwurf vollständig zurück: Empfänger, Betreff und Text – die Grundlage zum Vorlesen und für die Freigabe.',
  schema: readSchema,
  execute: async (input, context) => {
    const { emailId } = input as z.infer<typeof readSchema>;
    const email = context.repos.emails.byId(emailId);
    if (!email) return fail(`Entwurf ${emailId} existiert nicht.`);
    return ok(`Entwurf ${emailId} an ${email.toAddresses.join(', ')}: ${email.subject}`, {
      emailId: email.id,
      empfaenger: email.toAddresses,
      betreff: email.subject,
      text: email.bodyText,
      status: email.status,
      anhaenge: email.attachments,
      vorlesetext: `${email.subject}. ${email.bodyText}`,
      vorschau: vorschau(email)
    });
  }
};

const updateSchema = z.object({
  emailId: z.number().int(),
  subject: z.string().optional().describe('Neue Betreffzeile'),
  bodyText: z.string().optional().describe('Vollständig neuer Mailtext'),
  to: z.array(z.string()).optional().describe('Neue Empfängerliste'),
  anweisung: z
    .string()
    .optional()
    .describe('Freie Überarbeitungsanweisung, z. B. "kürzer" oder "persönlicher" – der Text wird dann neu geschrieben')
});

const updateEmailDraft: ToolDefinition = {
  name: 'update_email_draft',
  agent: 'MailAgent',
  description:
    'Ändert einen Entwurf. Entweder mit konkretem Text oder mit einer Anweisung wie "mach ihn kürzer". ' +
    'Jede Änderung setzt eine bereits erteilte Freigabe zurück – danach muss neu freigegeben werden.',
  schema: updateSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof updateSchema>;
    const email = context.repos.emails.byId(daten.emailId);
    if (!email) return fail(`Entwurf ${daten.emailId} existiert nicht.`);
    if (email.status === EmailStatus.GESENDET) return fail('Diese Nachricht wurde bereits versendet und lässt sich nicht mehr ändern.');

    let patch: Record<string, unknown> = {};
    if (daten.subject !== undefined) patch.subject = daten.subject;
    if (daten.bodyText !== undefined) patch.bodyText = daten.bodyText;
    if (daten.to !== undefined) patch.to = daten.to.map(normalizeEmail);

    if (daten.anweisung && daten.bodyText === undefined) {
      if (!context.llm.configured()) {
        return fail(`Für die Überarbeitung wird ein Sprachmodell gebraucht. ${context.llm.missingHint()}`);
      }
      try {
        const neu = await ueberarbeiteMail(
          context.llm,
          { subject: patch.subject as string ?? email.subject, bodyText: email.bodyText },
          daten.anweisung,
          context.config.sender
        );
        patch = { ...patch, subject: neu.subject, bodyText: neu.bodyText };
      } catch (error) {
        return fail(`Die Überarbeitung ist fehlgeschlagen: ${(error as Error).message}`);
      }
    }

    if (Object.keys(patch).length === 0) return fail('Es wurde keine Änderung angegeben.');
    const aktualisiert = context.repos.emails.updateDraft(daten.emailId, patch);
    if (!aktualisiert) return fail(`Entwurf ${daten.emailId} konnte nicht geändert werden.`);
    return ok(`Entwurf ${aktualisiert.id} überarbeitet. Eine frühere Freigabe ist damit hinfällig.`, {
      emailId: aktualisiert.id,
      betreff: aktualisiert.subject,
      text: aktualisiert.bodyText,
      status: aktualisiert.status,
      vorschau: vorschau(aktualisiert)
    });
  }
};

const listSchema = z.object({
  status: z
    .enum(['ENTWURF', 'WARTET_AUF_FREIGABE', 'FREIGEGEBEN', 'GESENDET', 'FEHLGESCHLAGEN', 'EMPFANGEN'])
    .optional(),
  campaignId: z.number().int().optional(),
  limit: z.number().int().min(1).max(100).optional()
});

const listEmailDrafts: ToolDefinition = {
  name: 'list_email_drafts',
  agent: 'MailAgent',
  description: 'Listet E-Mails mit Status, Empfänger und Betreff – etwa "zeig mir alle fertigen Entwürfe".',
  schema: listSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof listSchema>;
    const liste = context.repos.emails.list({
      ...(daten.status ? { status: daten.status as EmailStatus } : {}),
      ...(daten.campaignId !== undefined ? { campaignId: daten.campaignId } : {}),
      limit: daten.limit ?? 50
    });
    return ok(`${liste.length} Nachricht(en) gefunden.`, {
      anzahl: liste.length,
      nachrichten: liste.map((email, index) => ({
        nummer: index + 1,
        emailId: email.id,
        empfaenger: email.toAddresses.join(', '),
        betreff: email.subject,
        status: email.status,
        unternehmen: email.companyId ? context.repos.companies.byId(email.companyId)?.name ?? null : null,
        auszug: truncate(email.bodyText, 160)
      }))
    });
  }
};

const attachmentSchema = z.object({
  emailId: z.number().int(),
  pfad: z.string().describe('Vollständiger Pfad der anzuhängenden Datei')
});

const addAttachment: ToolDefinition = {
  name: 'add_attachment',
  agent: 'MailAgent',
  description: 'Hängt eine vorhandene Datei an einen Entwurf an. Ausführbare Dateien werden abgelehnt.',
  schema: attachmentSchema,
  execute: async (input, context) => {
    const { emailId, pfad } = input as z.infer<typeof attachmentSchema>;
    const email = context.repos.emails.byId(emailId);
    if (!email) return fail(`Entwurf ${emailId} existiert nicht.`);
    if (!SystemService.anhangErlaubt(pfad)) {
      return fail('Dieser Dateityp wird nicht als Anhang zugelassen (nur Dokumente, Bilder, ZIP).');
    }
    let info;
    try {
      info = await context.system.dateiInfo(pfad);
    } catch (error) {
      return fail(`Anhang nicht verwendbar: ${(error as Error).message}`);
    }
    const anhaenge = [
      ...email.attachments,
      { filename: info.name, path: info.pfad, size: info.groesse }
    ];
    const aktualisiert = context.repos.emails.updateDraft(emailId, { attachments: anhaenge });
    return ok(`${info.name} an Entwurf ${emailId} angehängt.`, {
      emailId,
      anhaenge: aktualisiert?.attachments ?? anhaenge
    });
  }
};

const approvalSchema = z.object({
  emailId: z.number().int().describe('Entwurf, für den die Freigabe angefragt wird')
});

const requestSendApproval: ToolDefinition = {
  name: 'request_send_approval',
  agent: 'MailAgent',
  description:
    'Fordert die Freigabe für den Versand eines Entwurfs an. Zeigt dem Benutzer Empfänger, Betreff und vollständigen ' +
    'Text. Gibt die Freigabe-Nummer zurück, die send_email später braucht. Sendet selbst nichts.',
  schema: approvalSchema,
  execute: async (input, context) => {
    const { emailId } = input as z.infer<typeof approvalSchema>;
    const email = context.repos.emails.byId(emailId);
    if (!email) return fail(`Entwurf ${emailId} existiert nicht.`);
    if (email.status === EmailStatus.GESENDET) return fail('Diese Nachricht wurde bereits versendet.');

    const pruefung = context.mail.vorpruefung(email);
    if (!pruefung.ok) {
      return fail(`Versand nicht möglich: ${pruefung.hindernisse.join(' ')}`);
    }

    const unternehmen = email.companyId ? context.repos.companies.byId(email.companyId) : null;
    const approval = context.approvals.request({
      action: 'send_email',
      title: `E-Mail an ${email.toAddresses.join(', ')}`,
      summary: [
        `Empfänger: ${email.toAddresses.join(', ')}`,
        `Betreff: ${email.subject}`,
        unternehmen ? `Unternehmen: ${unternehmen.name}` : null,
        ...pruefung.hinweise.map((hinweis) => `Hinweis: ${hinweis}`)
      ]
        .filter(Boolean)
        .join('\n'),
      payload: {
        emailId: email.id,
        empfaenger: email.toAddresses,
        betreff: email.subject,
        text: email.bodyText,
        anhaenge: email.attachments.map((a) => a.filename),
        hinweise: pruefung.hinweise,
        vorschau: vorschau(email)
      },
      contentHash: email.contentHash,
      ttlMinutes: context.config.limits.approvalTtlMinutes
    });
    context.repos.emails.linkApproval(email.id, approval.id);
    if (email.campaignId && email.companyId) {
      context.repos.campaigns.setTargetStatus(
        email.campaignId,
        email.companyId,
        OutreachStatus.WARTET_AUF_FREIGABE,
        { emailId: email.id }
      );
    }
    return ok(
      `Freigabe ${approval.id} angefragt: Versand an ${email.toAddresses.join(', ')} – Betreff „${email.subject}“.`,
      {
        approvalId: approval.id,
        emailId: email.id,
        empfaenger: email.toAddresses,
        betreff: email.subject,
        text: email.bodyText,
        hinweise: pruefung.hinweise,
        naechsterSchritt:
          'Warten Sie auf die ausdrückliche Freigabe des Benutzers. Erst danach darf send_email aufgerufen werden.'
      },
      { approvalId: approval.id }
    );
  }
};

const sendSchema = z.object({
  emailId: z.number().int().describe('Zu versendender Entwurf'),
  approvalId: z.number().int().describe('Nummer der vom Benutzer erteilten Freigabe')
});

/**
 * Der einzige Weg, eine E-Mail tatsächlich zu versenden.
 *
 * Die Freigabe wird nicht hier geprüft, sondern in der Registry eingelöst –
 * dieses Werkzeug wird also erst betreten, wenn eine gültige, inhaltlich
 * passende Freigabe vorlag. Der MailService prüft zusätzlich ein zweites Mal.
 */
const sendEmail: ToolDefinition = {
  name: 'send_email',
  agent: 'MailAgent',
  criticalAction: 'send_email',
  description:
    'Versendet einen freigegebenen Entwurf. Benötigt zwingend die Nummer einer erteilten Freigabe, die zu genau ' +
    'diesem Text gehört. Ohne Freigabe passiert nichts.',
  schema: sendSchema,
  contentHash: (input, context) => {
    const email = context.repos.emails.byId(Number((input as { emailId: number }).emailId));
    // Kein Entwurf → absichtlich unpassende Prüfsumme, damit nichts eingelöst wird.
    return email?.contentHash ?? 'entwurf-nicht-vorhanden';
  },
  execute: async (input, context) => {
    const { emailId, approvalId } = input as z.infer<typeof sendSchema>;
    const email = context.repos.emails.byId(emailId);
    if (!email) return fail(`Entwurf ${emailId} existiert nicht.`);
    const approval = context.approvals.byId(approvalId);
    if (!approval) return fail(`Freigabe ${approvalId} existiert nicht.`);

    context.repos.emails.markApproved(email.id);
    const ergebnis = await context.mail.versendeFreigegeben(email, approval);

    if (!ergebnis.ok) {
      context.repos.emails.markFailed(email.id, ergebnis.error ?? 'Unbekannter Fehler');
      if (email.campaignId && email.companyId) {
        context.repos.campaigns.setTargetStatus(email.campaignId, email.companyId, OutreachStatus.FEHLER, {
          emailId: email.id,
          lastError: ergebnis.error ?? null
        });
      }
      return fail(`Versand fehlgeschlagen: ${ergebnis.error}`, { approvalId });
    }

    context.repos.emails.markSent(email.id, ergebnis.messageId ?? null);
    if (email.companyId) {
      context.repos.interactions.add({
        companyId: email.companyId,
        contactId: email.contactId,
        emailId: email.id,
        kind: 'ausgehende-mail',
        summary: `E-Mail „${email.subject}“ an ${email.toAddresses.join(', ')}`
      });
    }
    if (email.campaignId && email.companyId) {
      context.repos.campaigns.setTargetStatus(email.campaignId, email.companyId, OutreachStatus.GESENDET, {
        emailId: email.id,
        lastError: null
      });
    }
    return ok(
      ergebnis.simuliert
        ? `Testbetrieb: Nachricht an ${email.toAddresses.join(', ')} wurde NICHT wirklich versendet, nur protokolliert.`
        : `E-Mail an ${email.toAddresses.join(', ')} wurde versendet.`,
      {
        emailId: email.id,
        messageId: ergebnis.messageId ?? null,
        simuliert: Boolean(ergebnis.simuliert),
        abgelehnteEmpfaenger: ergebnis.rejected ?? []
      }
    );
  }
};

const replySchema = z.object({
  seitTagen: z.number().int().min(1).max(90).optional().describe('Zeitraum, Standard 7 Tage'),
  maxAnzahl: z.number().int().min(1).max(200).optional()
});

const fetchReplies: ToolDefinition = {
  name: 'fetch_replies',
  agent: 'MailAgent',
  description:
    'Holt neue Nachrichten aus dem Posteingang und ordnet sie den angeschriebenen Unternehmen zu. Liest nur, ändert nichts.',
  schema: replySchema,
  execute: async (input, context) => {
    const { seitTagen, maxAnzahl } = input as z.infer<typeof replySchema>;
    const seit = new Date(Date.now() - (seitTagen ?? 7) * 86_400_000);
    const ergebnis = await context.mail.antwortenAbholen(seit, maxAnzahl ?? 50);
    if (ergebnis.fehler) return fail(`Posteingang nicht erreichbar: ${ergebnis.fehler}`);
    return ok(`${ergebnis.gelesen} Nachricht(en) gelesen, ${ergebnis.zugeordnet} einem Unternehmen zugeordnet.`, ergebnis);
  }
};

const verifySendSchema = z.object({
  emailId: z.number().int()
});

const checkSendReadiness: ToolDefinition = {
  name: 'check_send_readiness',
  agent: 'MailAgent',
  description:
    'Prüft ohne zu senden, ob ein Entwurf versandfertig ist: Sperrliste, Verifizierungsgrad, Tageslimit, ' +
    'Versandweg und frühere Kontakte.',
  schema: verifySendSchema,
  execute: async (input, context) => {
    const { emailId } = input as z.infer<typeof verifySendSchema>;
    const email = context.repos.emails.byId(emailId);
    if (!email) return fail(`Entwurf ${emailId} existiert nicht.`);
    const pruefung = context.mail.vorpruefung(email);
    const adressen = email.toAddresses.map((adresse) => {
      const bekannt = context.repos.addresses.findByAddress(adresse)[0];
      return {
        adresse,
        status: bekannt?.verificationStatus ?? 'unbekannt (manuell eingetragen)',
        quelle: bekannt?.evidenceUrl ?? null
      };
    });
    return ok(
      pruefung.ok ? `Entwurf ${emailId} ist versandfertig.` : `Entwurf ${emailId} ist nicht versandfertig.`,
      {
        versandfertig: pruefung.ok,
        hindernisse: pruefung.hindernisse,
        hinweise: pruefung.hinweise,
        empfaenger: adressen,
        heuteVersendet: context.mail.heuteVersendet(),
        tageslimit: context.config.limits.dailySendLimit,
        nurVerifizierteErlaubt: VerificationStatus.VERIFIZIERT
      }
    );
  }
};

export const mailTools: ToolDefinition[] = [
  createEmailDraft,
  readEmailDraft,
  updateEmailDraft,
  listEmailDrafts,
  addAttachment,
  requestSendApproval,
  sendEmail,
  fetchReplies,
  checkSendReadiness
];
