import { z } from 'zod/v4';
import { err, makeError, ok } from '../../shared/types.js';
import { defineTool } from './Tool.js';

export const createCampaignTool = defineTool({
  name: 'create_campaign',
  agent: 'OutreachAgent',
  description:
    'Legt eine Akquise-Kampagne an: Name, angebotene Dienstleistung, Zielregion und Zielanzahl. Die Kampagne bündelt Recherche und Entwürfe.',
  schema: z.object({
    name: z.string().min(3),
    service: z.string().min(3).describe('Die angebotene Leistung, z. B. "24/7 Baustellenbewachung"'),
    region: z.string().optional(),
    targetCount: z.number().int().min(1).max(200).default(25),
    notes: z.string().optional(),
  }),
  summarize: (input) => `Kampagne anlegen: ${input.name}`,
  async run(input, context) {
    const campaign = context.repos.campaigns.create({
      name: input.name,
      service: input.service,
      region: input.region ?? null,
      targetCount: input.targetCount,
      notes: input.notes ?? null,
    });
    context.services.audit.log({
      actor: 'benutzer',
      agent: 'OutreachAgent',
      action: 'kampagne.angelegt',
      subject: `campaign:${campaign.id}`,
      outcome: 'ok',
      detail: `${campaign.name} — ${campaign.service}`,
    });
    return ok({
      kampagneId: campaign.id,
      name: campaign.name,
      dienstleistung: campaign.service,
      region: campaign.region,
      ziel: campaign.targetCount,
    });
  },
});

export const listCampaignsTool = defineTool({
  name: 'list_campaigns',
  agent: 'OutreachAgent',
  description: 'Listet alle Kampagnen mit Status und Zielanzahl.',
  schema: z.object({}),
  summarize: () => 'Kampagnen auflisten',
  async run(_input, context) {
    return ok(
      context.repos.campaigns.list().map((campaign) => ({
        kampagneId: campaign.id,
        name: campaign.name,
        dienstleistung: campaign.service,
        region: campaign.region,
        ziel: campaign.targetCount,
        status: campaign.status,
        entwuerfe: context.repos.emails.list({ campaignId: campaign.id, limit: 500 }).length,
      })),
    );
  },
});

export const prepareOutreachTool = defineTool({
  name: 'prepare_outreach',
  agent: 'OutreachAgent',
  description:
    'Erstellt für die angegebenen Unternehmen individuelle Akquise-Entwürfe zu einer Kampagne. Prüft vorher: Sperre, Sperrliste, bereits erfolgter Erstkontakt, vorhandener Entwurf und verifizierte Adresse. Es wird nichts versendet.',
  schema: z.object({
    campaignId: z.number().int(),
    companyIds: z
      .array(z.number().int())
      .optional()
      .describe('Leer lassen, um alle recherchierten Unternehmen mit verifizierter Adresse zu verwenden'),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  summarize: (input) =>
    `Entwürfe für Kampagne ${input.campaignId}${input.companyIds ? ` (${input.companyIds.length} Firmen)` : ''}`,
  async run(input, context) {
    const settings = context.services.settings.get();
    const ids =
      input.companyIds ??
      context.repos.companies
        .list(500)
        .filter(
          (company) =>
            !company.doNotContact &&
            context.repos.companies.bestEmailAddress(
              company.id,
              settings.compliance.requireVerifiedAddress,
            ) !== null,
        )
        .slice(0, input.limit)
        .map((company) => company.id);

    if (ids.length === 0) {
      return err(
        makeError(
          'outreach.no_targets',
          'Es gibt keine Unternehmen mit verifizierter E-Mail-Adresse, für die ein Entwurf möglich wäre.',
          { hint: 'Zuerst research_companies ausführen.' },
        ),
      );
    }

    const result = await context.agents.outreach.prepareDrafts(input.campaignId, ids, (message) =>
      context.status(message),
    );
    if (!result.ok) return result;
    return ok({
      entwuerfe: result.value.drafted,
      entwurfIds: result.value.draftIds,
      uebersprungen: result.value.skipped,
      hinweis: 'Alle Entwürfe warten auf Prüfung. Für den Versand ist je Nachricht eine Freigabe nötig.',
    });
  },
});

export const runCampaignTool = defineTool({
  name: 'run_campaign',
  agent: 'OutreachAgent',
  description:
    'Führt eine Kampagne vollständig aus: recherchiert Unternehmen und erstellt anschließend individuelle Entwürfe. Der Versand bleibt in jedem Fall freigabepflichtig.',
  schema: z.object({
    campaignId: z.number().int(),
  }),
  summarize: (input) => `Kampagne ${input.campaignId} ausführen`,
  async run(input, context) {
    const result = await context.agents.outreach.runCampaign(input.campaignId, (message) =>
      context.status(message),
    );
    if (!result.ok) return result;
    return ok({
      recherchiert: result.value.researched,
      entwuerfe: result.value.drafted,
      uebersprungen: result.value.skipped,
    });
  },
});

export const sendDeskTool = defineTool({
  name: 'show_send_desk',
  agent: 'OutreachAgent',
  description:
    'Gibt die Versandzentrale zurück: je Unternehmen Ansprechpartner, Adresse, Quelle, Verifizierungsstatus, Akquisegrund, Mailstatus, letzter Kontakt und Freigabestatus.',
  schema: z.object({
    campaignId: z.number().int().optional(),
    onlyReadyForApproval: z.boolean().default(false),
    search: z.string().optional(),
  }),
  summarize: () => 'Versandzentrale anzeigen',
  async run(input, context) {
    const rows = context.repos.companies.sendDeskRows({
      campaignId: input.campaignId,
      onlyReadyForApproval: input.onlyReadyForApproval,
      search: input.search,
    });
    return ok(
      rows.map((row) => ({
        unternehmen: row.company,
        ansprechpartner: row.contact,
        email: row.email,
        quelle: row.source,
        verifizierung: row.email_status ?? 'keine Adresse',
        akquisegrund: row.rationale,
        mailstatus: row.mail_status ?? 'kein_entwurf',
        entwurfId: row.email_id,
        letzterKontakt: row.last_contact_at,
        freigabe: row.approval_status ?? 'keine',
        gesperrt: row.do_not_contact === 1,
      })),
    );
  },
});
