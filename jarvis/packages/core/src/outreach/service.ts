import type { Repositories } from '../db/repos/index.js';
import type { CampaignRow, CompanyRow } from '../db/schema.js';
import type { TargetView } from '../db/repos/campaigns.js';
import type { LlmProvider } from '../llm/types.js';
import type { MailService } from '../mail/service.js';
import type { ResearchService } from '../research/service.js';
import type { ComplianceGuard } from '../compliance/guard.js';
import type { AuditLogService } from '../services/audit.js';
import type { EventBus } from '../services/events.js';
import type { MemoryService } from '../services/memory.js';
import { err, ok, type Result } from '../util/result.js';
import { truncate, wordCount } from '../util/text.js';

export interface OutreachServiceOptions {
  repos: Repositories;
  research: ResearchService;
  mail: MailService;
  llm: LlmProvider;
  compliance: ComplianceGuard;
  audit: AuditLogService;
  memory: MemoryService;
  bus?: EventBus;
}

export interface CampaignSetup {
  name: string;
  service: string;
  region?: string;
  radiusKm?: number;
  goalCount?: number;
  brief?: string;
  senderSignature?: string;
}

export interface ResearchRunResult {
  campaign: CampaignRow;
  geprueft: number;
  neuAufgenommen: number;
  mitVerifizierterAdresse: number;
  uebersprungen: Array<{ firma: string; grund: string }>;
  hinweise: string[];
}

export interface DraftResult {
  targetId: string;
  emailId: string;
  firma: string;
  empfaenger: string;
  betreff: string;
  text: string;
  akquisegrund: string;
}

/**
 * Verbindet Recherche und Mailentwurf zu einer Kampagne.
 *
 * Wichtig: dieser Dienst bereitet alles vor -- recherchieren, bereinigen,
 * begruenden, formulieren. Er verschickt nichts. Der Versand laeuft
 * ausschliesslich ueber die Approval-Engine.
 */
export class OutreachService {
  private readonly repos: Repositories;
  private readonly research: ResearchService;
  private readonly mail: MailService;
  private readonly llm: LlmProvider;
  private readonly compliance: ComplianceGuard;
  private readonly audit: AuditLogService;
  private readonly memory: MemoryService;
  private readonly bus: EventBus | undefined;

  constructor(options: OutreachServiceOptions) {
    this.repos = options.repos;
    this.research = options.research;
    this.mail = options.mail;
    this.llm = options.llm;
    this.compliance = options.compliance;
    this.audit = options.audit;
    this.memory = options.memory;
    this.bus = options.bus;
  }

  createCampaign(setup: CampaignSetup): Result<CampaignRow> {
    const existing = this.repos.campaigns.findByName(setup.name);
    if (existing) {
      return err('DUPLICATE', `Es gibt bereits eine Kampagne "${setup.name}".`, {
        hint: 'Anderen Namen wählen oder die bestehende Kampagne fortsetzen.',
        detail: { campaignId: existing.id },
      });
    }
    const row = this.repos.campaigns.create({
      name: setup.name,
      service: setup.service,
      region: setup.region ?? null,
      radiusKm: setup.radiusKm ?? null,
      goalCount: setup.goalCount ?? 20,
      brief: setup.brief ?? null,
      senderSignature: setup.senderSignature ?? null,
    });
    this.audit.log({
      actor: 'OutreachAgent',
      action: 'kampagne.angelegt',
      summary: `Kampagne "${row.name}" angelegt (${row.service}, Ziel: ${row.goal_count} Unternehmen)`,
      entityType: 'campaign',
      entityId: row.id,
    });
    this.bus?.emit('invalidate', { scope: 'campaigns' });
    return ok(row);
  }

  getCampaign(idOrName: string): CampaignRow | undefined {
    return this.repos.campaigns.get(idOrName) ?? this.repos.campaigns.findByName(idOrName);
  }

  overview(campaignId?: string): TargetView[] {
    return this.repos.campaigns.overview(campaignId ? { campaignId } : {});
  }

  // --- Recherchelauf ------------------------------------------------------

  /**
   * Sucht Unternehmen, prueft sie und nimmt die brauchbaren in die Kampagne auf.
   * Dubletten und bereits kontaktierte Firmen fallen dabei heraus.
   */
  async researchTargets(
    campaignId: string,
    input: { branche: string; ort?: string; limit?: number; zusatz?: string },
    signal?: AbortSignal,
  ): Promise<Result<ResearchRunResult>> {
    const campaign = this.repos.campaigns.get(campaignId);
    if (!campaign) return err('NOT_FOUND', `Kampagne ${campaignId} existiert nicht.`);

    const ziel = Math.min(input.limit ?? campaign.goal_count, 50);
    this.repos.campaigns.setStatus(campaign.id, 'recherche');

    const kandidaten = await this.research.findCompanyCandidates(
      { branche: input.branche, ort: input.ort ?? campaign.region ?? undefined, zusatz: input.zusatz, limit: ziel * 2 },
      signal,
    );
    if (!kandidaten.ok) return kandidaten;

    const uebersprungen: ResearchRunResult['uebersprungen'] = [];
    const hinweise: string[] = [];
    let neu = 0;
    let mitAdresse = 0;
    let geprueft = 0;

    for (const kandidat of kandidaten.data) {
      if (neu >= ziel) break;
      if (signal?.aborted) {
        hinweise.push('Der Lauf wurde abgebrochen.');
        break;
      }
      geprueft += 1;
      this.bus?.emit('progress', {
        task: `Recherche "${campaign.name}"`,
        done: geprueft,
        total: kandidaten.data.length,
        note: kandidat.name,
      });

      // Schon in dieser Kampagne? Dann nicht noch einmal recherchieren.
      const bekannt = this.repos.companies.findExisting({ name: kandidat.name, website: kandidat.website });
      if (bekannt && this.repos.campaigns.findTargetByCompany(campaign.id, bekannt.id)) {
        uebersprungen.push({ firma: kandidat.name, grund: 'Bereits in dieser Kampagne' });
        continue;
      }

      const profil = await this.research.profileCompany(
        { name: kandidat.name, website: kandidat.website, ort: input.ort ?? null, branche: input.branche, snippet: kandidat.snippet },
        signal,
      );
      if (!profil.ok) {
        uebersprungen.push({ firma: kandidat.name, grund: profil.error.message });
        continue;
      }

      const firma = profil.data.company;

      // Sperrliste und Vorkontakt pruefen -- kein zweiter Erstkontakt.
      const sperre = this.compliance.checkSuppression({ address: `info@${firma.domain ?? 'unbekannt.invalid'}`, companyName: firma.name });
      if (!sperre.ok) {
        uebersprungen.push({ firma: firma.name, grund: sperre.error.message });
        continue;
      }
      const vorkontakt = this.repos.emails.lastSentToCompany(firma.id);
      if (vorkontakt?.sent_at) {
        uebersprungen.push({
          firma: firma.name,
          grund: `Am ${new Date(vorkontakt.sent_at).toLocaleDateString('de-DE')} bereits angeschrieben`,
        });
        continue;
      }

      const verifiziert = profil.data.emails.filter((e) => e.verification === 'VERIFIZIERT');
      const target = this.repos.campaigns.addTarget(campaign.id, firma.id);
      this.repos.campaigns.setTargetStatus(target.id, verifiziert.length > 0 ? 'kontakt_gefunden' : 'recherche');
      if (verifiziert.length > 0) mitAdresse += 1;
      neu += 1;
      for (const h of profil.data.hinweise) if (!hinweise.includes(h)) hinweise.push(h);
    }

    this.repos.campaigns.setStatus(campaign.id, 'recherchiert');
    this.audit.log({
      actor: 'OutreachAgent',
      action: 'kampagne.recherche',
      summary: `Recherche für "${campaign.name}": ${neu} Unternehmen aufgenommen, davon ${mitAdresse} mit verifizierter Adresse`,
      entityType: 'campaign',
      entityId: campaign.id,
      detail: { geprueft, uebersprungen: uebersprungen.length },
    });
    this.bus?.emit('invalidate', { scope: 'campaigns' });

    return ok({
      campaign,
      geprueft,
      neuAufgenommen: neu,
      mitVerifizierterAdresse: mitAdresse,
      uebersprungen,
      hinweise,
    });
  }

  // --- Entwuerfe ----------------------------------------------------------

  /** Erstellt einen individuellen Entwurf fuer ein einzelnes Ziel. */
  async draftFor(targetId: string, options: { tonalitaet?: string; maxWoerter?: number } = {}): Promise<Result<DraftResult>> {
    const target = this.repos.campaigns.getTarget(targetId);
    if (!target) return err('NOT_FOUND', `Zielzeile ${targetId} existiert nicht.`);
    const campaign = this.repos.campaigns.get(target.campaign_id);
    const company = this.repos.companies.get(target.company_id);
    if (!campaign || !company) return err('NOT_FOUND', 'Kampagne oder Firma fehlt.');

    const adresse = this.repos.companies.bestEmailOf(company.id, this.compliance.currentLimits.requireVerifiedRecipient);
    if (!adresse) {
      const grund = 'Keine verifizierte E-Mail-Adresse gefunden';
      this.repos.campaigns.setTargetStatus(targetId, 'recherche', grund);
      return err('UNVERIFIED_RECIPIENT', `${company.name}: ${grund}.`, {
        hint: 'Adresse manuell mit Quelle eintragen oder die Firma überspringen.',
      });
    }

    const contact = adresse.contact_id
      ? this.repos.companies.getContact(adresse.contact_id)
      : this.repos.companies.contactsOf(company.id)[0];

    const fakten = this.repos.companies
      .factsOf(company.id)
      .filter((f) => f.kind === 'FAKT')
      .map((f) => {
        const src = f.source_id ? this.repos.companies.getSource(f.source_id) : undefined;
        return `- ${f.label}: ${truncate(f.value, 400)}${src ? ` [Quelle: ${src.url}]` : ''}`;
      });

    const generated = await this.generateEmail({
      campaign,
      company,
      fakten,
      empfaenger: adresse.address,
      adressArt: adresse.kind,
      ansprechpartner: contact ? { name: contact.full_name, role: contact.role } : null,
      tonalitaet: options.tonalitaet ?? null,
      maxWoerter: options.maxWoerter ?? 180,
    });
    if (!generated.ok) return generated;

    // Der Akquisegrund ist eine Einschaetzung, kein Fakt -- so wird er auch abgelegt.
    this.repos.companies.addFact({
      companyId: company.id,
      kind: 'KI_EINSCHAETZUNG',
      label: 'Akquisegrund',
      value: generated.data.akquisegrund,
      sourceId: null,
    });

    const draft = await this.mail.createDraft({
      to: adresse.address,
      toName: contact?.full_name ?? company.name,
      subject: generated.data.betreff,
      body: generated.data.text,
      companyId: company.id,
      contactId: contact?.id ?? null,
      campaignId: campaign.id,
    });
    if (!draft.ok) return draft;

    this.repos.campaigns.updateTarget(targetId, {
      status: 'entwurf',
      email_id: draft.data.email.id,
      reason: generated.data.akquisegrund,
      last_error: null,
    });
    this.bus?.emit('invalidate', { scope: 'campaigns' });

    return ok({
      targetId,
      emailId: draft.data.email.id,
      firma: company.name,
      empfaenger: adresse.address,
      betreff: generated.data.betreff,
      text: generated.data.text,
      akquisegrund: generated.data.akquisegrund,
    });
  }

  /** Entwuerfe fuer alle Ziele einer Kampagne, die noch keinen haben. */
  async draftAll(
    campaignId: string,
    options: { limit?: number; tonalitaet?: string; signal?: AbortSignal } = {},
  ): Promise<Result<{ erstellt: DraftResult[]; fehlgeschlagen: Array<{ firma: string; grund: string }> }>> {
    const campaign = this.repos.campaigns.get(campaignId);
    if (!campaign) return err('NOT_FOUND', `Kampagne ${campaignId} existiert nicht.`);

    const offen = this.repos.campaigns
      .overview({ campaignId, status: ['neu', 'kontakt_gefunden', 'recherche'] })
      .slice(0, options.limit ?? 50);

    const erstellt: DraftResult[] = [];
    const fehlgeschlagen: Array<{ firma: string; grund: string }> = [];

    for (const [i, zeile] of offen.entries()) {
      if (options.signal?.aborted) break;
      this.bus?.emit('progress', {
        task: `Entwürfe "${campaign.name}"`,
        done: i + 1,
        total: offen.length,
        note: zeile.companyName,
      });
      const r = await this.draftFor(zeile.target.id, options.tonalitaet ? { tonalitaet: options.tonalitaet } : {});
      if (r.ok) erstellt.push(r.data);
      else fehlgeschlagen.push({ firma: zeile.companyName, grund: r.error.message });
    }

    this.audit.log({
      actor: 'OutreachAgent',
      action: 'kampagne.entwuerfe',
      summary: `${erstellt.length} Entwürfe für "${campaign.name}" erstellt (${fehlgeschlagen.length} ohne Entwurf)`,
      entityType: 'campaign',
      entityId: campaignId,
    });
    return ok({ erstellt, fehlgeschlagen });
  }

  // --- Formulierung -------------------------------------------------------

  private async generateEmail(input: {
    campaign: CampaignRow;
    company: CompanyRow;
    fakten: string[];
    empfaenger: string;
    adressArt: 'funktion' | 'person';
    ansprechpartner: { name: string; role: string | null } | null;
    tonalitaet: string | null;
    maxWoerter: number;
  }): Promise<Result<{ betreff: string; text: string; akquisegrund: string }>> {
    const absender = input.campaign.sender_signature ?? this.memory.list('fakt').find((m) => m.key === 'Signatur')?.value ?? '';

    const system = [
      'Du formulierst eine geschäftliche Erstansprache (Kaltakquise) auf Deutsch.',
      '',
      'Feste Regeln:',
      '- Nur Angaben verwenden, die unten unter FAKTEN stehen. Nichts hinzuerfinden:',
      '  keine Projekte, keine Mitarbeiterzahlen, keine Referenzen, keine Auszeichnungen.',
      '- Wenn zu wenig bekannt ist, bleib allgemein statt zu spekulieren.',
      '- Sie-Form. Sachlich, kurz, ohne Werbefloskeln und ohne Superlative.',
      `- Höchstens ${input.maxWoerter} Wörter im Fließtext.`,
      '- Keine Anhänge erwähnen, keine Preise nennen, keine Fristen setzen.',
      '- Kein "Ich hoffe, es geht Ihnen gut" und keine erfundene Vorgeschichte.',
      '- Am Ende ein Satz mit einem konkreten, unaufdringlichen nächsten Schritt.',
      input.tonalitaet ? `- Zusätzliche Vorgabe zur Tonalität: ${input.tonalitaet}` : '',
      '',
      'Antworte ausschließlich mit einem JSON-Objekt in genau dieser Form:',
      '{"betreff": "...", "text": "...", "akquisegrund": "..."}',
      '"akquisegrund" ist eine kurze Einschätzung (1–2 Sätze), warum das Unternehmen',
      'als Kunde interessant sein könnte — klar als Einschätzung formuliert, nicht als Tatsache.',
    ]
      .filter(Boolean)
      .join('\n');

    const anrede = input.ansprechpartner
      ? `Ansprechpartner: ${input.ansprechpartner.name}${input.ansprechpartner.role ? ` (${input.ansprechpartner.role})` : ''}`
      : input.adressArt === 'funktion'
        ? 'Kein namentlicher Ansprechpartner bekannt — allgemeine Anrede verwenden ("Sehr geehrte Damen und Herren").'
        : 'Kein Ansprechpartner belegt — allgemeine Anrede verwenden.';

    const user = [
      `ANGEBOTENE LEISTUNG: ${input.campaign.service}`,
      input.campaign.brief ? `HINTERGRUND ZUM ABSENDER: ${input.campaign.brief}` : '',
      absender ? `SIGNATUR (unverändert ans Ende setzen):\n${absender}` : '',
      '',
      `EMPFÄNGERFIRMA: ${input.company.name}`,
      input.company.city ? `ORT: ${input.company.city}` : '',
      input.company.industry ? `BRANCHE: ${input.company.industry}` : '',
      input.company.website ? `WEBSITE: ${input.company.website}` : '',
      anrede,
      '',
      'FAKTEN (nur diese verwenden):',
      input.fakten.length ? input.fakten.join('\n') : '- (keine belegten Angaben vorhanden)',
    ]
      .filter(Boolean)
      .join('\n');

    let response;
    try {
      response = await this.llm.chat({
        system,
        messages: [{ role: 'user', content: user }],
        temperature: 0.4,
        maxTokens: 1200,
      });
    } catch (e) {
      return err('PROVIDER_ERROR', `Das Sprachmodell hat nicht geantwortet: ${e instanceof Error ? e.message : String(e)}`, {
        hint: 'API-Schlüssel und Netzverbindung prüfen.',
      });
    }

    const parsed = parseEmailJson(response.text);
    if (!parsed) {
      return err('PROVIDER_ERROR', 'Das Sprachmodell hat kein verwertbares JSON geliefert.', {
        detail: truncate(response.text, 500),
        hint: 'Erneut versuchen oder ein anderes Modell wählen.',
      });
    }
    if (!parsed.betreff.trim() || !parsed.text.trim()) {
      return err('PROVIDER_ERROR', 'Betreff oder Mailtext kamen leer zurück.');
    }
    if (wordCount(parsed.text) > input.maxWoerter * 2) {
      // Nur ein Hinweis im Log -- der Nutzer sieht den Text ohnehin vor der Freigabe.
      this.audit.log({
        actor: 'OutreachAgent',
        action: 'entwurf.laenge',
        summary: `Entwurf für ${input.company.name} ist mit ${wordCount(parsed.text)} Wörtern länger als vorgegeben.`,
        entityType: 'company',
        entityId: input.company.id,
      });
    }

    return ok(parsed);
  }
}

/** Holt das JSON-Objekt aus der Modellantwort, auch wenn es in ```json steht. */
export function parseEmailJson(raw: string): { betreff: string; text: string; akquisegrund: string } | null {
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fence?.[1]) candidates.push(fence[1]);
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1));
  candidates.push(raw);

  for (const c of candidates) {
    try {
      const v = JSON.parse(c.trim()) as Record<string, unknown>;
      const betreff = typeof v.betreff === 'string' ? v.betreff : typeof v.subject === 'string' ? v.subject : null;
      const text = typeof v.text === 'string' ? v.text : typeof v.body === 'string' ? v.body : null;
      if (betreff && text) {
        return {
          betreff: betreff.trim(),
          text: text.trim(),
          akquisegrund: typeof v.akquisegrund === 'string' ? v.akquisegrund.trim() : 'Keine Begründung geliefert.',
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}
