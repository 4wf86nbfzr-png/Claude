import { z } from 'zod/v4';
import type {
  CampaignRecord,
  CompanyDossier,
  EmailRecord,
  JarvisError,
  Result,
} from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { CompanyRepository } from '../db/repositories/companies.js';
import type { EmailRepository } from '../db/repositories/emails.js';
import type { CampaignRepository } from '../db/repositories/misc.js';
import type { AuditLogService } from '../services/AuditLogService.js';
import type { ComplianceService } from '../services/ComplianceService.js';
import type { SettingsService } from '../services/SettingsService.js';
import type { LlmProvider } from '../llm/types.js';
import type { MailAgent } from './MailAgent.js';
import type { CompanyResearchAgent, ResearchProgress } from './CompanyResearchAgent.js';
import { parseJsonObject } from './CompanyResearchAgent.js';
import { formatDe } from '../util/id.js';

const DraftSchema = z.object({
  subject: z.string().min(4).max(160),
  body: z.string().min(40),
  rationale: z.string().min(10),
});

export interface OutreachDeps {
  companies: CompanyRepository;
  emails: EmailRepository;
  campaigns: CampaignRepository;
  mail: MailAgent;
  research: CompanyResearchAgent;
  compliance: ComplianceService;
  settings: SettingsService;
  audit: AuditLogService;
  llm: () => Result<LlmProvider, JarvisError>;
}

export interface PrepareOutcome {
  drafted: number;
  skipped: Array<{ company: string; reason: string }>;
  draftIds: number[];
}

/**
 * Connects research and mail (§5).
 *
 * It prepares everything up to and including the draft — and stops there.
 * Nothing in this class can send; it has no transport and calls only
 * `MailAgent.createDraft`.
 */
export class OutreachAgent {
  readonly name = 'OutreachAgent';

  constructor(private readonly deps: OutreachDeps) {}

  /** Full campaign run: research, then a personalised draft per company. */
  async runCampaign(
    campaignId: number,
    onProgress: ResearchProgress = () => undefined,
  ): Promise<Result<PrepareOutcome & { researched: number }, JarvisError>> {
    const campaign = this.deps.campaigns.get(campaignId);
    if (!campaign) return err(makeError('outreach.no_campaign', `Kampagne ${campaignId} existiert nicht.`));

    const research = await this.deps.research.research(
      {
        query: `${campaign.name} ${campaign.service}`.trim(),
        region: campaign.region ?? undefined,
        limit: campaign.targetCount,
        campaignId,
      },
      onProgress,
    );
    if (!research.ok) return research;

    const candidates = this.deps.companies
      .list(500)
      .filter((company) => !company.doNotContact && company.researchedAt)
      .slice(0, campaign.targetCount);

    const prepared = await this.prepareDrafts(
      campaignId,
      candidates.map((company) => company.id),
      onProgress,
    );
    if (!prepared.ok) return prepared;

    return ok({ ...prepared.value, researched: research.value.found });
  }

  /** Creates one individual draft per company. */
  async prepareDrafts(
    campaignId: number,
    companyIds: number[],
    onProgress: ResearchProgress = () => undefined,
  ): Promise<Result<PrepareOutcome, JarvisError>> {
    const campaign = this.deps.campaigns.get(campaignId);
    if (!campaign) return err(makeError('outreach.no_campaign', `Kampagne ${campaignId} existiert nicht.`));

    const settings = this.deps.settings.get();
    const outcome: PrepareOutcome = { drafted: 0, skipped: [], draftIds: [] };

    for (const companyId of companyIds) {
      const dossier = this.deps.companies.dossier(companyId);
      if (!dossier) {
        outcome.skipped.push({ company: `#${companyId}`, reason: 'Unternehmen nicht gefunden' });
        continue;
      }
      const company = dossier.company;

      // Duplicate protection (§14): never a second first contact by accident.
      const previous = this.deps.emails.previousContact(companyId);
      if (previous?.sentAt) {
        outcome.skipped.push({
          company: company.name,
          reason: `Am ${formatDe(previous.sentAt)} bereits angeschrieben — kein zweiter Erstkontakt ohne ausdrückliche Anweisung.`,
        });
        continue;
      }
      const existingDraft = this.deps.emails
        .list({ companyId, limit: 10 })
        .find((mail) => mail.status === 'entwurf' || mail.status === 'wartet_auf_freigabe');
      if (existingDraft) {
        outcome.skipped.push({
          company: company.name,
          reason: `Es gibt bereits Entwurf ${existingDraft.id}.`,
        });
        continue;
      }

      const address = this.deps.companies.bestEmailAddress(
        companyId,
        settings.compliance.requireVerifiedAddress,
      );
      if (!address) {
        outcome.skipped.push({
          company: company.name,
          reason: 'Keine verifizierte E-Mail-Adresse gefunden',
        });
        continue;
      }

      const recipientCheck = this.deps.compliance.checkRecipient(
        address.address,
        companyId,
        settings.compliance,
      );
      if (!recipientCheck.ok) {
        outcome.skipped.push({ company: company.name, reason: recipientCheck.error.message });
        continue;
      }

      onProgress(`Entwurf für ${company.name} …`);
      const composed = await this.compose(dossier, campaign);
      if (!composed.ok) {
        outcome.skipped.push({ company: company.name, reason: composed.error.message });
        continue;
      }

      const draft = this.deps.mail.createDraft({
        companyId,
        contactId: address.contactId ?? null,
        campaignId,
        to: address.address,
        subject: composed.value.subject,
        body: composed.value.body,
      });
      if (!draft.ok) {
        outcome.skipped.push({ company: company.name, reason: draft.error.message });
        continue;
      }

      this.deps.companies.setRationale(companyId, composed.value.rationale);
      outcome.drafted += 1;
      outcome.draftIds.push(draft.value.id);
    }

    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: 'akquise.vorbereitet',
      subject: `campaign:${campaignId}`,
      outcome: 'ok',
      detail: `${outcome.drafted} Entwürfe erstellt, ${outcome.skipped.length} übersprungen.`,
    });

    return ok(outcome);
  }

  /* ---------------------------------------------------------------- */

  /** Writes one individual mail. No template, no mail-merge (§5). */
  private async compose(
    dossier: CompanyDossier,
    campaign: CampaignRecord,
  ): Promise<Result<{ subject: string; body: string; rationale: string }, JarvisError>> {
    const llm = this.deps.llm();
    if (!llm.ok) return llm;

    const settings = this.deps.settings.get();
    const company = dossier.company;
    const contact = dossier.contacts[0];

    const facts = [
      `Firmenname: ${company.name}`,
      company.website ? `Website: ${company.website}` : null,
      company.city ? `Standort: ${company.city}` : null,
      company.industry ? `Branche: ${company.industry}` : null,
      company.description ? `Beschreibung laut Website: ${company.description}` : null,
      contact ? `Ansprechpartner: ${contact.fullName}${contact.role ? `, ${contact.role}` : ''}` : null,
      `Quellen: ${dossier.sources.map((source) => source.url).join(', ') || 'keine'}`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    const sender = [
      `Unser Unternehmen: ${settings.company.name}`,
      settings.company.services ? `Unsere Leistungen: ${settings.company.services}` : null,
      settings.company.pitch ? `Positionierung: ${settings.company.pitch}` : null,
      settings.company.website ? `Website: ${settings.company.website}` : null,
      settings.company.phone ? `Telefon: ${settings.company.phone}` : null,
      `Absender: ${settings.mail.identity.name} <${settings.mail.identity.email}>`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    const response = await llm.value.complete({
      system: OUTREACH_SYSTEM_PROMPT,
      maxTokens: 2000,
      effort: 'medium',
      tools: [],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `Kampagne: ${campaign.name}`,
                `Angebotene Dienstleistung: ${campaign.service}`,
                campaign.region ? `Zielregion: ${campaign.region}` : null,
                campaign.notes ? `Hinweise: ${campaign.notes}` : null,
                '',
                '--- Empfängerunternehmen (recherchierte Fakten) ---',
                facts,
                '',
                '--- Absender ---',
                sender,
              ]
                .filter((line): line is string => line !== null)
                .join('\n'),
            },
          ],
        },
      ],
    });

    if (!response.ok) return response;

    const text = response.value.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n');

    const parsed = DraftSchema.safeParse(parseJsonObject(text));
    if (!parsed.success) {
      return err(
        makeError('outreach.draft_unparsable', 'Das Modell lieferte keinen verwertbaren Entwurf.', {
          detail: parsed.error.issues.map((issue) => issue.message).join('; '),
        }),
      );
    }

    return ok({
      subject: parsed.data.subject.trim(),
      body: parsed.data.body.trim(),
      rationale: `KI-EINSCHÄTZUNG: ${parsed.data.rationale.trim()}`,
    });
  }
}

const OUTREACH_SYSTEM_PROMPT = `Du schreibst individuelle Erstkontakt-E-Mails im deutschen B2B-Geschäft.

Stil:
- Sie-Form, sachlich, freundlich, norddeutsch-nüchtern. Keine Superlative, keine Werbefloskeln.
- 120 bis 180 Wörter. Kurze Absätze.
- Beziehe dich konkret auf das Empfängerunternehmen — nur mit Angaben, die in den recherchierten Fakten stehen.
- Ein klarer, niedrigschwelliger Schlusssatz (Rückfrage oder kurzes Telefonat), keine Terminfalle.
- Keine Betreffzeilen in Großbuchstaben, keine Ausrufezeichen, keine Emojis.

Absolute Regeln:
- Erfinde keine Fakten über den Empfänger. Steht etwas nicht in den Fakten, erwähne es nicht.
- Behaupte keine bestehende Geschäftsbeziehung und kein früheres Gespräch.
- Keine Rabatt- oder Preisversprechen.
- Jede Mail muss inhaltlich eigenständig sein; kein austauschbarer Serienbrieftext.
- Schreibe keine Signatur und keine Grußformel mit Kontaktdaten ans Ende — die Signatur wird automatisch angehängt. Ende mit "Viele Grüße" und dem Namen des Absenders.

Antworte ausschließlich mit einem JSON-Objekt, ohne Markdown:
{
  "subject": "Betreffzeile",
  "body": "Vollständiger Mailtext",
  "rationale": "Ein bis zwei Sätze, warum dieses Unternehmen als Kunde interessant sein könnte — ausdrücklich als Einschätzung formuliert."
}`;
