import type { EmailRepo } from '../db/repos/emails.js';
import type { CompanyRepo } from '../db/repos/companies.js';
import type { SuppressionRepo } from '../db/repos/misc.js';
import { err, ok, type Result } from '../util/result.js';
import { companySlug, domainOfEmail } from '../util/text.js';

/**
 * Compliance-Pruefungen vor jedem Versand.
 *
 * Diese Klasse sagt nur Ja oder Nein und begruendet es. Sie kennt weder
 * Agenten noch Oberflaeche und wird sowohl beim Entwurf (frueh warnen) als
 * auch unmittelbar vor dem Versand (verbindlich) aufgerufen.
 */

export interface ComplianceLimits {
  maxPerHour: number;
  maxPerDay: number;
  minIntervalSeconds: number;
  requireVerifiedRecipient: boolean;
  /** Erneuter Erstkontakt fruehestens nach so vielen Tagen. */
  reContactCooldownDays: number;
}

export const DEFAULT_LIMITS: ComplianceLimits = {
  maxPerHour: 20,
  maxPerDay: 100,
  minIntervalSeconds: 20,
  requireVerifiedRecipient: true,
  reContactCooldownDays: 90,
};

export interface RecipientCheck {
  address: string;
  companyId?: string | null;
  companyName?: string | null;
  /** Bei einer Antwort auf eine eingehende Mail entfaellt die Erstkontaktsperre. */
  isReply?: boolean;
  /** Ausdruecklicher Wunsch des Nutzers, trotz Vorkontakt erneut zu schreiben. */
  overrideDuplicate?: boolean;
}

export interface ComplianceWarning {
  code: string;
  message: string;
}

export class ComplianceGuard {
  constructor(
    private readonly suppression: SuppressionRepo,
    private readonly emails: EmailRepo,
    private readonly companies: CompanyRepo,
    private readonly limits: ComplianceLimits = DEFAULT_LIMITS,
  ) {}

  get currentLimits(): ComplianceLimits {
    return this.limits;
  }

  /** Steht der Empfaenger auf der Sperrliste? */
  checkSuppression(input: { address: string; companyName?: string | null }): Result<void> {
    const email = this.suppression.find('email', input.address);
    if (email) {
      return err('SUPPRESSED', `${input.address} steht auf der Sperrliste.`, {
        hint: email.reason ? `Grund: ${email.reason}` : 'Eintrag in der Sperrliste entfernen, falls das ein Irrtum ist.',
      });
    }
    const domain = domainOfEmail(input.address);
    if (domain) {
      const d = this.suppression.find('domain', domain);
      if (d) {
        return err('SUPPRESSED', `Die Domain ${domain} steht auf der Sperrliste.`, {
          hint: d.reason ? `Grund: ${d.reason}` : undefined,
        });
      }
    }
    if (input.companyName) {
      const c = this.suppression.find('firma', companySlug(input.companyName));
      if (c) {
        return err('SUPPRESSED', `${input.companyName} steht auf der Sperrliste.`, {
          hint: c.reason ? `Grund: ${c.reason}` : undefined,
        });
      }
    }
    return ok(undefined);
  }

  /** Wurde die Firma/Adresse schon einmal angeschrieben? */
  checkDuplicate(input: RecipientCheck): Result<void> {
    if (input.isReply || input.overrideDuplicate) return ok(undefined);

    const lastToAddress = this.emails.lastSentTo(input.address);
    const lastToCompany = input.companyId ? this.emails.lastSentToCompany(input.companyId) : undefined;
    const last = lastToAddress ?? lastToCompany;
    if (!last?.sent_at) return ok(undefined);

    const days = (Date.now() - new Date(last.sent_at).getTime()) / 86_400_000;
    if (days > this.limits.reContactCooldownDays) return ok(undefined);

    const when = new Date(last.sent_at).toLocaleDateString('de-DE');
    const wer = input.companyName ?? input.address;
    return err(
      'DUPLICATE',
      `${wer} wurde am ${when} bereits angeschrieben ("${last.subject}").`,
      {
        hint: 'Kein zweiter Erstkontakt. Wenn das trotzdem gewollt ist, bitte ausdrücklich bestätigen (überschreiben).',
        detail: { emailId: last.id, sentAt: last.sent_at, subject: last.subject },
      },
    );
  }

  /** Versandlimits: Stunde, Tag, Mindestabstand. */
  checkRateLimit(now = new Date()): Result<void> {
    const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();

    const perHour = this.emails.countSentSince(hourAgo);
    if (perHour >= this.limits.maxPerHour) {
      return err('RATE_LIMITED', `Versandlimit erreicht: ${perHour} Mails in der letzten Stunde (Grenze ${this.limits.maxPerHour}).`, {
        hint: 'Später fortsetzen oder das Limit in den Einstellungen anheben.',
      });
    }
    const perDay = this.emails.countSentSince(dayAgo);
    if (perDay >= this.limits.maxPerDay) {
      return err('RATE_LIMITED', `Tageslimit erreicht: ${perDay} Mails in 24 Stunden (Grenze ${this.limits.maxPerDay}).`, {
        hint: 'Morgen fortsetzen oder das Limit in den Einstellungen anheben.',
      });
    }
    const last = this.emails.lastSendAt();
    if (last) {
      const since = (now.getTime() - new Date(last).getTime()) / 1000;
      if (since < this.limits.minIntervalSeconds) {
        const wait = Math.ceil(this.limits.minIntervalSeconds - since);
        return err('RATE_LIMITED', `Mindestabstand zwischen zwei Sendungen: noch ${wait} Sekunden warten.`, {
          hint: 'Der Abstand verhindert, dass ein Serienversand wie Spam aussieht.',
        });
      }
    }
    return ok(undefined);
  }

  /** Nur verifizierte Adressen -- sofern nicht ausdruecklich gelockert. */
  checkVerification(address: string): Result<void> {
    if (!this.limits.requireVerifiedRecipient) return ok(undefined);
    const row = this.companies.findEmailAddress(address);
    if (!row) {
      return err(
        'UNVERIFIED_RECIPIENT',
        `Zu ${address} liegt kein Herkunftsnachweis vor.`,
        {
          hint: 'Adressen ohne belegte Quelle werden nicht angeschrieben. Adresse recherchieren oder manuell mit Quelle eintragen.',
        },
      );
    }
    if (row.verification !== 'VERIFIZIERT') {
      return err(
        'UNVERIFIED_RECIPIENT',
        `${address} hat den Status ${row.verification}, nicht VERIFIZIERT.`,
        {
          hint: row.verify_note ?? 'Nur verifizierte Adressen dürfen standardmäßig angeschrieben werden.',
        },
      );
    }
    return ok(undefined);
  }

  /**
   * Alle Pruefungen fuer den Versand. Reihenfolge ist bewusst: Sperrliste
   * zuerst, weil ein Widerspruch schwerer wiegt als ein Limit.
   */
  checkBeforeSend(input: RecipientCheck, now = new Date()): Result<void> {
    const checks = [
      this.checkSuppression({ address: input.address, companyName: input.companyName ?? null }),
      this.checkVerification(input.address),
      this.checkDuplicate(input),
      this.checkRateLimit(now),
    ];
    for (const c of checks) if (!c.ok) return c;
    return ok(undefined);
  }

  /**
   * Weichere Pruefung fuer die Entwurfsphase: liefert Warnungen statt
   * Abbruch, damit der Nutzer die Lage sieht, bevor er freigibt.
   */
  warningsForDraft(input: RecipientCheck): ComplianceWarning[] {
    const out: ComplianceWarning[] = [];
    for (const c of [
      this.checkSuppression({ address: input.address, companyName: input.companyName ?? null }),
      this.checkVerification(input.address),
      this.checkDuplicate(input),
    ]) {
      if (!c.ok) out.push({ code: c.error.code, message: c.error.message });
    }
    return out;
  }
}
