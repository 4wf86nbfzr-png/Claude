import type { ComplianceSettings, EmailRecord, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { CompanyRepository } from '../db/repositories/companies.js';
import type { EmailRepository } from '../db/repositories/emails.js';

export interface SendGuardContext {
  email: EmailRecord;
  settings: ComplianceSettings;
}

/**
 * Everything that must be true before a mail may leave the machine, other than
 * the human approval itself (§17).
 *
 * The checks run twice: once when a draft is prepared (so the send desk can
 * show the reason early) and once immediately before the transport call, so a
 * change in the meantime cannot slip through.
 */
export class ComplianceService {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly emails: EmailRepository,
  ) {}

  /** Checks that do not depend on a concrete draft — used during research. */
  checkRecipient(
    address: string,
    companyId: number | null,
    settings: ComplianceSettings,
  ): Result<true> {
    const normalized = address.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(normalized)) {
      return err(
        makeError('compliance.invalid_address', `„${address}" ist keine gültige E-Mail-Adresse.`),
      );
    }

    const suppressed = this.companies.isSuppressed(normalized);
    if (suppressed.suppressed) {
      return err(
        makeError(
          'compliance.suppressed',
          `${normalized} steht auf der Sperrliste (${suppressed.reason}).`,
          { hint: 'Eintrag in den Einstellungen entfernen, falls das ein Irrtum ist.' },
        ),
      );
    }

    if (companyId !== null) {
      const company = this.companies.get(companyId);
      if (!company) {
        return err(makeError('compliance.company_missing', `Unternehmen ${companyId} existiert nicht.`));
      }
      if (company.doNotContact) {
        return err(
          makeError(
            'compliance.do_not_contact',
            `${company.name} ist als „nicht kontaktieren" markiert${
              company.doNotContactReason ? ` (${company.doNotContactReason})` : ''
            }.`,
          ),
        );
      }

      const previous = this.emails.previousContact(companyId);
      if (previous?.sentAt) {
        const days = daysBetween(previous.sentAt, new Date().toISOString());
        if (days < settings.reContactBlockDays) {
          return err(
            makeError(
              'compliance.recent_contact',
              `${company.name} wurde am ${formatDate(previous.sentAt)} bereits angeschrieben (vor ${Math.floor(days)} Tagen).`,
              {
                hint: `Ein erneuter Erstkontakt ist erst nach ${settings.reContactBlockDays} Tagen vorgesehen. Ausdrücklich anfordern, um ihn trotzdem vorzubereiten.`,
              },
            ),
          );
        }
      }
    }

    return ok(true);
  }

  /** Full pre-send guard. Called immediately before the transport runs. */
  checkSend(context: SendGuardContext): Result<true> {
    const { email, settings } = context;

    if (email.status === 'gesendet') {
      return err(
        makeError('compliance.already_sent', 'Diese Nachricht wurde bereits versendet.', {
          hint: 'Für eine erneute Zustellung einen neuen Entwurf anlegen.',
        }),
      );
    }
    if (!email.subject.trim()) {
      return err(makeError('compliance.no_subject', 'Die Nachricht hat keinen Betreff.'));
    }
    if (!email.body.trim()) {
      return err(makeError('compliance.no_body', 'Die Nachricht hat keinen Text.'));
    }

    const recipientCheck = this.checkRecipient(email.to, email.companyId ?? null, settings);
    if (!recipientCheck.ok) return recipientCheck;

    if (settings.requireVerifiedAddress && email.companyId) {
      const addresses = this.companies.emailAddresses(email.companyId);
      const match = addresses.find(
        (candidate) => candidate.address.toLowerCase() === email.to.trim().toLowerCase(),
      );
      if (!match) {
        return err(
          makeError(
            'compliance.address_unknown',
            `${email.to} ist für dieses Unternehmen nicht als recherchierte Adresse hinterlegt.`,
            { hint: 'Nur recherchierte, belegte Adressen dürfen verwendet werden.' },
          ),
        );
      }
      if (match.status !== 'VERIFIZIERT') {
        return err(
          makeError(
            'compliance.address_unverified',
            `${email.to} hat den Status ${match.status} — es dürfen nur verifizierte Adressen angeschrieben werden.`,
            {
              hint: 'Entweder die Adresse belegen oder in den Einstellungen „Nur verifizierte Adressen" abschalten.',
            },
          ),
        );
      }
    }

    // Rolling 24 h volume cap.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const sent = this.emails.sendsSince(since);
    if (sent >= settings.dailySendLimit) {
      return err(
        makeError(
          'compliance.daily_limit',
          `Das Tageslimit von ${settings.dailySendLimit} Nachrichten ist erreicht (${sent} in den letzten 24 Stunden).`,
          { hint: 'Limit in den Einstellungen anpassen oder morgen fortfahren.' },
        ),
      );
    }

    // Minimum spacing between two sends.
    const last = this.emails.lastSendAt();
    if (last) {
      const elapsed = (Date.now() - new Date(last).getTime()) / 1000;
      if (elapsed < settings.minSecondsBetweenSends) {
        const wait = Math.ceil(settings.minSecondsBetweenSends - elapsed);
        return err(
          makeError(
            'compliance.too_fast',
            `Zwischen zwei Sendungen liegen mindestens ${settings.minSecondsBetweenSends} Sekunden. Noch ${wait} Sekunden warten.`,
            { retryable: true },
          ),
        );
      }
    }

    return ok(true);
  }
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (24 * 3600 * 1000);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(iso),
  );
}
