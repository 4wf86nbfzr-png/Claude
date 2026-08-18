import type { Repositories } from '../../db/repositories';
import type { Approval, EmailRecord, ProviderHealth } from '../../../shared/types';
import { ApprovalStatus, VerificationStatus } from '../../../shared/status';
import type { JarvisConfig } from '../config';
import type { CredentialService } from '../credentials';
import type { AuditLogService } from '../audit';
import { GmailTransport } from './gmail';
import { ImapReader } from './imap';
import { SmtpTransport } from './smtp';
import type { MailReader, MailTransport, OutgoingMessage, SendResult } from './types';

export * from './types';
export { GmailTransport } from './gmail';
export { SmtpTransport } from './smtp';
export { ImapReader } from './imap';
export { GoogleOAuthClient, GMAIL_SCOPES, CALENDAR_SCOPES } from './googleOAuth';

/** Kein Versandweg eingerichtet. */
class KeinVersand implements MailTransport {
  readonly id = 'keiner';
  readonly label = 'Kein Versandweg eingerichtet';
  configured(): boolean {
    return false;
  }
  missingHint(): string {
    return 'JARVIS_MAIL_PROVIDER auf "smtp" oder "gmail" setzen und die Zugangsdaten hinterlegen.';
  }
  async send(): Promise<SendResult> {
    return { ok: false, error: `Es ist kein Versandweg eingerichtet. ${this.missingHint()}` };
  }
  async verify(): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: this.missingHint() };
  }
}

export interface Vorpruefung {
  ok: boolean;
  /** Harte Hindernisse – bei diesen wird nicht gesendet. */
  hindernisse: string[];
  /** Hinweise, die in der Freigabekarte auftauchen (z. B. Dubletten). */
  hinweise: string[];
}

/**
 * Verbindet Versandweg, Regeln und Protokoll.
 *
 * Die eigentliche Freigabeprüfung liegt in der Werkzeug-Registry; hier steht
 * die zweite Verteidigungslinie: `versendeFreigegeben` verlangt das
 * Freigabeobjekt und vergleicht dessen Prüfsumme noch einmal mit der
 * Nachricht. Ohne passende Freigabe verlässt keine Mail dieses Programm.
 */
export class MailService {
  constructor(
    readonly transport: MailTransport,
    readonly reader: MailReader | null,
    private readonly repos: Repositories,
    private readonly config: JarvisConfig,
    private readonly audit: AuditLogService
  ) {}

  static create(
    config: JarvisConfig,
    credentials: CredentialService,
    repos: Repositories,
    audit: AuditLogService,
    /** Ersatzbausteine – für Tests und für später ergänzte Versandwege. */
    ersatz: { transport?: MailTransport; reader?: MailReader | null } = {}
  ): MailService {
    const transport: MailTransport =
      ersatz.transport ??
      (config.mail.provider === 'smtp'
        ? new SmtpTransport({
            host: config.mail.smtp.host,
            port: config.mail.smtp.port,
            secure: config.mail.smtp.secure,
            user: config.mail.smtp.user,
            password: credentials.get('SMTP_PASSWORD')
          })
        : config.mail.provider === 'gmail'
          ? new GmailTransport(credentials)
          : new KeinVersand());

    const reader =
      ersatz.reader !== undefined
        ? ersatz.reader
        : config.mail.imap.host
      ? new ImapReader({
          host: config.mail.imap.host,
          port: config.mail.imap.port,
          secure: config.mail.imap.secure,
          user: config.mail.imap.user,
          password: credentials.get('IMAP_PASSWORD'),
          mailbox: config.mail.imap.mailbox
        })
      : null;

    return new MailService(transport, reader, repos, config, audit);
  }

  status(): ProviderHealth[] {
    const eintraege: ProviderHealth[] = [
      {
        id: this.transport.id,
        label: `Versand: ${this.transport.label}`,
        configured: this.transport.configured(),
        hint: this.transport.missingHint()
      }
    ];
    if (this.reader) {
      eintraege.push({
        id: this.reader.id,
        label: 'Posteingang: IMAP',
        configured: this.reader.configured(),
        hint: this.reader.missingHint()
      });
    }
    return eintraege;
  }

  /** Wie viele Nachrichten wurden heute schon versendet? */
  heuteVersendet(): number {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.repos.emails.sentSince(start.toISOString());
  }

  /**
   * Prüft alles, was unabhängig von der Freigabe gelten muss: Sperrliste,
   * Tageslimit, Empfängeranzahl und Verifizierungsgrad. Dubletten werden als
   * Hinweis gemeldet, damit sie in der Freigabekarte sichtbar sind.
   */
  vorpruefung(email: EmailRecord): Vorpruefung {
    const hindernisse: string[] = [];
    const hinweise: string[] = [];

    if (email.toAddresses.length === 0) hindernisse.push('Es ist kein Empfänger eingetragen.');
    if (email.toAddresses.length > this.config.limits.maxRecipientsPerMail) {
      hindernisse.push(
        `Mehr als ${this.config.limits.maxRecipientsPerMail} Empfänger in einer Nachricht. ` +
          'Akquise wird einzeln versendet, nicht als Rundmail.'
      );
    }
    if (email.bcc.length > 0) {
      hinweise.push('Die Nachricht hat Blindkopie-Empfänger. Bei Akquise ist das unüblich – bitte prüfen.');
    }
    if (!email.subject.trim()) hindernisse.push('Die Betreffzeile ist leer.');
    if (!email.bodyText.trim()) hindernisse.push('Der Mailtext ist leer.');

    for (const adresse of email.toAddresses) {
      const gesperrt = this.repos.suppression.blocks(adresse);
      if (gesperrt) {
        hindernisse.push(
          `${adresse} steht auf der Sperrliste${gesperrt.reason ? ` (${gesperrt.reason})` : ''} und wird nicht angeschrieben.`
        );
        continue;
      }
      const bekannt = this.repos.addresses.findByAddress(adresse);
      if (bekannt.length > 0 && !bekannt.some((e) => e.verificationStatus === VerificationStatus.VERIFIZIERT)) {
        hindernisse.push(
          `${adresse} ist nur als ${bekannt[0]?.verificationStatus} erfasst. ` +
            'Es werden ausschließlich verifizierte Adressen angeschrieben.'
        );
      }
      const frueher = this.repos.emails.lastSentToAddress(adresse);
      if (frueher?.sentAt) {
        hinweise.push(
          `${adresse} wurde bereits am ${new Date(frueher.sentAt).toLocaleDateString('de-DE')} angeschrieben ` +
            `(Betreff: „${frueher.subject}“).`
        );
      }
    }

    const heute = this.heuteVersendet();
    if (heute >= this.config.limits.dailySendLimit) {
      hindernisse.push(
        `Das Tageslimit von ${this.config.limits.dailySendLimit} Nachrichten ist erreicht (heute: ${heute}).`
      );
    }

    if (!this.transport.configured()) {
      hindernisse.push(`Kein Versandweg eingerichtet. ${this.transport.missingHint()}`);
    }

    return { ok: hindernisse.length === 0, hindernisse, hinweise };
  }

  /**
   * Versendet eine Nachricht – ausschließlich mit passender Freigabe.
   * Die Signatur verlangt das Freigabeobjekt, damit es keinen Aufrufweg gibt,
   * der die Freigabe schlicht vergisst.
   */
  async versendeFreigegeben(email: EmailRecord, approval: Approval): Promise<SendResult> {
    if (approval.action !== 'send_email') {
      return { ok: false, error: `Die vorgelegte Freigabe gilt für "${approval.action}", nicht für den Mailversand.` };
    }
    if (![ApprovalStatus.FREIGEGEBEN, ApprovalStatus.VERBRAUCHT].includes(approval.status as never)) {
      return { ok: false, error: `Die Freigabe ist nicht gültig (Status: ${approval.status}).` };
    }
    if (approval.contentHash !== email.contentHash) {
      return {
        ok: false,
        error: 'Der Mailinhalt weicht von der Freigabe ab. Es wird nichts versendet.'
      };
    }

    const pruefung = this.vorpruefung(email);
    if (!pruefung.ok) {
      return { ok: false, error: pruefung.hindernisse.join(' ') };
    }

    const letzte = this.repos.emails.list({ limit: 1 }).find((e) => e.sentAt);
    if (letzte?.sentAt) {
      const abstand = (Date.now() - new Date(letzte.sentAt).getTime()) / 1000;
      if (abstand < this.config.limits.sendCooldownSeconds) {
        return {
          ok: false,
          error: `Zwischen zwei Sendungen liegen mindestens ${this.config.limits.sendCooldownSeconds} Sekunden. Bitte kurz warten.`
        };
      }
    }

    const nachricht: OutgoingMessage = {
      from: {
        name: this.config.mail.fromName,
        address: email.fromAddress ?? this.config.mail.fromAddress
      },
      to: email.toAddresses,
      cc: email.cc,
      bcc: email.bcc,
      replyTo: this.config.mail.replyTo,
      subject: email.subject,
      text: email.bodyText,
      html: email.bodyHtml,
      attachments: email.attachments,
      inReplyTo: email.inReplyTo
    };

    if (!nachricht.from.address) {
      return { ok: false, error: 'Es ist keine Absenderadresse eingerichtet (MAIL_FROM_ADDRESS).' };
    }

    if (this.config.limits.dryRun) {
      this.audit.log('Versand simuliert (Testbetrieb)', {
        agent: 'MailAgent',
        target: email.toAddresses.join(', '),
        status: 'OK',
        detail: { emailId: email.id, approvalId: approval.id, betreff: email.subject }
      });
      return { ok: true, messageId: `testbetrieb-${email.id}`, simuliert: true };
    }

    const ergebnis = await this.transport.send(nachricht);
    this.audit.log(ergebnis.ok ? 'E-Mail versendet' : 'Versand fehlgeschlagen', {
      agent: 'MailAgent',
      target: email.toAddresses.join(', '),
      status: ergebnis.ok ? 'OK' : 'FEHLER',
      detail: {
        emailId: email.id,
        approvalId: approval.id,
        betreff: email.subject,
        transport: this.transport.id,
        ...(ergebnis.error ? { fehler: ergebnis.error } : {}),
        ...(ergebnis.rejected?.length ? { abgelehnt: ergebnis.rejected } : {})
      }
    });
    return ergebnis;
  }

  /**
   * Holt neue Nachrichten und ordnet sie über Absenderadresse oder
   * Betreffbezug einem Unternehmen zu.
   */
  async antwortenAbholen(seit: Date, maxAnzahl = 50): Promise<{ gelesen: number; zugeordnet: number; fehler?: string }> {
    if (!this.reader) return { gelesen: 0, zugeordnet: 0, fehler: 'Kein Posteingang eingerichtet (IMAP_HOST fehlt).' };
    if (!this.reader.configured()) return { gelesen: 0, zugeordnet: 0, fehler: this.reader.missingHint() };
    let nachrichten;
    try {
      nachrichten = await this.reader.hole(seit, maxAnzahl);
    } catch (error) {
      return { gelesen: 0, zugeordnet: 0, fehler: (error as Error).message };
    }

    let zugeordnet = 0;
    for (const nachricht of nachrichten) {
      const treffer = this.repos.addresses.findByAddress(nachricht.from);
      const companyId = treffer[0]?.companyId ?? null;
      const gespeichert = this.repos.emails.recordIncoming({
        companyId,
        fromAddress: nachricht.from,
        to: nachricht.to,
        subject: nachricht.subject,
        bodyText: nachricht.text,
        messageId: nachricht.messageId,
        inReplyTo: nachricht.inReplyTo,
        threadKey: `zu:${nachricht.from}`,
        receivedAt: nachricht.date
      });
      if (companyId) {
        zugeordnet++;
        this.repos.interactions.add({
          companyId,
          emailId: gespeichert.id,
          kind: 'antwort',
          summary: `Antwort von ${nachricht.from}: ${nachricht.subject}`,
          occurredAt: nachricht.date
        });
      }
    }
    this.audit.log('Posteingang abgeholt', {
      agent: 'MailAgent',
      status: 'OK',
      detail: { gelesen: nachrichten.length, zugeordnet }
    });
    return { gelesen: nachrichten.length, zugeordnet };
  }
}
