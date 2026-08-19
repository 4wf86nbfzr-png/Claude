import { z } from 'zod';
import { defineTool, type AnyTool } from './types.js';
import { err, ok } from '../util/result.js';
import { TARGET_STATUS } from '../db/schema.js';
import { truncate } from '../util/text.js';

/** Firmendatenbank, Kampagnen und die Versandzentrale. */

export const findCompanyTool = defineTool({
  name: 'find_company_in_database',
  description:
    'Sucht Unternehmen in der lokalen Datenbank (bereits recherchierte Firmen) mit Kontaktdaten, Verifizierungsstatus und Kontakthistorie.',
  category: 'crm',
  readOnly: true,
  input: z.object({
    suchbegriff: z.string().optional(),
    ort: z.string().optional(),
    branche: z.string().optional(),
    anzahl: z.number().int().min(1).max(100).optional(),
  }),
  handler: async (input, ctx) => {
    const rows = ctx.repos.companies.list({
      ...(input.suchbegriff ? { search: input.suchbegriff } : {}),
      ...(input.ort ? { city: input.ort } : {}),
      ...(input.branche ? { industry: input.branche } : {}),
      limit: input.anzahl ?? 25,
    });
    return ok({
      anzahl: rows.length,
      firmen: rows.map((c) => {
        const adressen = ctx.repos.companies.emailsOf(c.id);
        const letzterKontakt = ctx.repos.emails.lastSentToCompany(c.id);
        return {
          firmaId: c.id,
          name: c.name,
          ort: c.city,
          website: c.website,
          branche: c.industry,
          adressen: adressen.map((a) => ({ adresse: a.address, status: a.verification })),
          zuletztAngeschrieben: letzterKontakt?.sent_at ?? null,
        };
      }),
    });
  },
  summarize: (_i, r) => (r.ok ? `${(r.data as { anzahl: number }).anzahl} Firmen in der Datenbank gefunden` : r.error.message),
});

export const companyDossierTool = defineTool({
  name: 'get_company_dossier',
  description:
    'Liefert alles zu einer Firma: Stammdaten, belegte Fakten mit Quelle, KI-Einschätzungen (klar getrennt), Ansprechpartner, Adressen und Kontakthistorie.',
  category: 'crm',
  readOnly: true,
  input: z.object({ firmaId: z.string() }),
  handler: async (input, ctx) => {
    const c = ctx.repos.companies.get(input.firmaId);
    if (!c) return err('NOT_FOUND', `Firma ${input.firmaId} existiert nicht.`);

    const fakten = ctx.repos.companies.factsOf(c.id);
    const quelle = (id: string | null) => (id ? (ctx.repos.companies.getSource(id)?.url ?? null) : null);

    return ok({
      firmaId: c.id,
      name: c.name,
      website: c.website,
      anschrift: [c.street, c.postal_code, c.city].filter(Boolean).join(', ') || null,
      branche: c.industry,
      telefon: c.phone,
      status: c.status,
      FAKTEN: fakten
        .filter((f) => f.kind === 'FAKT')
        .map((f) => ({ angabe: f.label, wert: truncate(f.value, 600), quelle: quelle(f.source_id) })),
      KI_EINSCHAETZUNGEN: fakten
        .filter((f) => f.kind === 'KI_EINSCHAETZUNG')
        .map((f) => ({ angabe: f.label, wert: f.value, hinweis: 'Einschätzung, kein belegter Fakt' })),
      ansprechpartner: ctx.repos.companies.contactsOf(c.id).map((p) => ({
        name: p.full_name,
        position: p.role,
        quelle: quelle(p.source_id),
      })),
      adressen: ctx.repos.companies.emailsOf(c.id).map((a) => ({
        adresse: a.address,
        status: a.verification,
        begruendung: a.verify_note,
        gefundenAuf: a.found_on_url,
        mxErreichbar: a.mx_ok === null ? null : a.mx_ok === 1,
      })),
      historie: ctx.repos.emails.historyOf(c.id, 20).map((h) => ({
        wann: h.occurred_at,
        richtung: h.direction,
        was: h.summary,
      })),
    });
  },
});

export const createCampaignTool = defineTool({
  name: 'create_campaign',
  description: 'Legt eine Akquise-Kampagne an (Name, angebotene Dienstleistung, Region, Zielzahl).',
  category: 'kampagne',
  readOnly: false,
  input: z.object({
    name: z.string().min(2),
    dienstleistung: z.string().min(2).describe('z. B. "24/7 Baustellenbewachung und Alarmüberwachung"'),
    region: z.string().optional(),
    umkreisKm: z.number().int().min(0).max(500).optional(),
    zielAnzahl: z.number().int().min(1).max(500).optional(),
    hintergrund: z.string().optional().describe('Kontext zum Absender, der in die Mails einfließen darf.'),
    signatur: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const r = ctx.outreach.createCampaign({
      name: input.name,
      service: input.dienstleistung,
      ...(input.region ? { region: input.region } : {}),
      ...(input.umkreisKm !== undefined ? { radiusKm: input.umkreisKm } : {}),
      ...(input.zielAnzahl !== undefined ? { goalCount: input.zielAnzahl } : {}),
      ...(input.hintergrund ? { brief: input.hintergrund } : {}),
      ...(input.signatur ? { senderSignature: input.signatur } : {}),
    });
    if (!r.ok) return r;
    return ok({ kampagneId: r.data.id, name: r.data.name, ziel: r.data.goal_count });
  },
  summarize: (input, r) => (r.ok ? `Kampagne "${input.name}" angelegt` : r.error.message),
});

export const researchCampaignTool = defineTool({
  name: 'research_campaign_targets',
  description:
    'Recherchiert Unternehmen für eine Kampagne: sucht Firmen, prüft ihre Websites, sammelt belegte Kontaktdaten, entfernt Dubletten und überspringt bereits angeschriebene Firmen. Erstellt noch keine Mails.',
  category: 'kampagne',
  readOnly: false,
  input: z.object({
    kampagneId: z.string(),
    branche: z.string().min(2),
    ort: z.string().optional(),
    anzahl: z.number().int().min(1).max(50).optional(),
    zusatz: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const r = await ctx.outreach.researchTargets(
      input.kampagneId,
      {
        branche: input.branche,
        ...(input.ort ? { ort: input.ort } : {}),
        ...(input.anzahl !== undefined ? { limit: input.anzahl } : {}),
        ...(input.zusatz ? { zusatz: input.zusatz } : {}),
      },
      ctx.signal,
    );
    if (!r.ok) return r;
    return ok({
      kampagne: r.data.campaign.name,
      geprueft: r.data.geprueft,
      aufgenommen: r.data.neuAufgenommen,
      mitVerifizierterAdresse: r.data.mitVerifizierterAdresse,
      ohneVerifizierteAdresse: r.data.neuAufgenommen - r.data.mitVerifizierterAdresse,
      uebersprungen: r.data.uebersprungen,
      hinweise: r.data.hinweise,
    });
  },
  summarize: (_i, r) =>
    r.ok
      ? `${(r.data as { aufgenommen: number }).aufgenommen} Unternehmen aufgenommen, ${(r.data as { mitVerifizierterAdresse: number }).mitVerifizierterAdresse} mit verifizierter Adresse`
      : r.error.message,
});

export const draftCampaignTool = defineTool({
  name: 'draft_campaign_emails',
  description:
    'Erstellt individuell angepasste Akquise-Entwürfe für die Unternehmen einer Kampagne. Jede Mail wird aus den belegten Angaben der jeweiligen Firma formuliert — keine identische Massenmail. Versendet nichts.',
  category: 'kampagne',
  readOnly: false,
  input: z.object({
    kampagneId: z.string(),
    anzahl: z.number().int().min(1).max(100).optional(),
    tonalitaet: z.string().optional().describe('z. B. "kürzer", "persönlicher", "sachlicher"'),
  }),
  handler: async (input, ctx) => {
    const r = await ctx.outreach.draftAll(input.kampagneId, {
      ...(input.anzahl !== undefined ? { limit: input.anzahl } : {}),
      ...(input.tonalitaet ? { tonalitaet: input.tonalitaet } : {}),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
    if (!r.ok) return r;
    return ok({
      erstellt: r.data.erstellt.length,
      entwuerfe: r.data.erstellt.map((d, i) => ({
        nummer: i + 1,
        entwurfId: d.emailId,
        firma: d.firma,
        an: d.empfaenger,
        betreff: d.betreff,
        akquisegrund: d.akquisegrund,
      })),
      ohneEntwurf: r.data.fehlgeschlagen,
      hinweis: 'Alle Entwürfe sind gespeichert. Für den Versand ist eine ausdrückliche Freigabe nötig.',
    });
  },
  summarize: (_i, r) => (r.ok ? `${(r.data as { erstellt: number }).erstellt} Entwürfe erstellt` : r.error.message),
});

export const draftSingleTool = defineTool({
  name: 'draft_single_outreach_email',
  description: 'Erstellt einen Akquise-Entwurf für genau eine Zeile der Versandzentrale.',
  category: 'kampagne',
  readOnly: false,
  input: z.object({ zeileId: z.string(), tonalitaet: z.string().optional() }),
  handler: async (input, ctx) => {
    const r = await ctx.outreach.draftFor(input.zeileId, input.tonalitaet ? { tonalitaet: input.tonalitaet } : {});
    if (!r.ok) return r;
    return ok(r.data);
  },
});

export const sendingCenterTool = defineTool({
  name: 'get_sending_center',
  description:
    'Liefert die Versandzentrale: eine Zeile je Unternehmen mit Ansprechpartner, E-Mail, Quelle, Verifizierungsstatus, Akquisegrund, Mailstatus, letztem Kontakt und Freigabestatus.',
  category: 'kampagne',
  readOnly: true,
  input: z.object({
    kampagneId: z.string().optional(),
    status: z
      .array(z.enum(Object.keys(TARGET_STATUS) as [keyof typeof TARGET_STATUS, ...Array<keyof typeof TARGET_STATUS>]))
      .optional(),
    anzahl: z.number().int().min(1).max(300).optional(),
  }),
  handler: async (input, ctx) => {
    const rows = ctx.repos.campaigns.overview({
      ...(input.kampagneId ? { campaignId: input.kampagneId } : {}),
      ...(input.status ? { status: input.status } : {}),
      limit: input.anzahl ?? 100,
    });
    return ok({
      anzahl: rows.length,
      zeilen: rows.map((z, i) => ({
        nummer: i + 1,
        zeileId: z.target.id,
        unternehmen: z.companyName,
        ansprechpartner: z.contactName,
        position: z.contactRole,
        email: z.email,
        quelle: z.sourceUrl,
        verifizierung: z.verification,
        akquisegrund: z.target.reason,
        mailstatus: z.emailStatus,
        letzterKontakt: z.lastContactAt,
        freigabestatus: z.approvalStatus ?? '—',
        status: TARGET_STATUS[z.target.status] ?? z.target.status,
        entwurfId: z.target.email_id,
        fehler: z.target.last_error,
      })),
    });
  },
  summarize: (_i, r) => (r.ok ? `Versandzentrale: ${(r.data as { anzahl: number }).anzahl} Zeilen` : r.error.message),
});

export const listCampaignsTool = defineTool({
  name: 'list_campaigns',
  description: 'Listet alle Kampagnen mit ihrem Fortschritt.',
  category: 'kampagne',
  readOnly: true,
  input: z.object({}),
  handler: async (_input, ctx) => {
    const rows = ctx.repos.campaigns.list();
    return ok({
      kampagnen: rows.map((c) => ({
        kampagneId: c.id,
        name: c.name,
        dienstleistung: c.service,
        region: c.region,
        ziel: c.goal_count,
        status: c.status,
        verteilung: Object.fromEntries(
          Object.entries(ctx.repos.campaigns.countByStatus(c.id)).map(([k, v]) => [TARGET_STATUS[k as keyof typeof TARGET_STATUS] ?? k, v]),
        ),
      })),
    });
  },
});

export const suppressionTool = defineTool({
  name: 'manage_suppression_list',
  description:
    'Verwaltet die Sperrliste (Do-not-contact). Adressen, Domains oder Firmen darauf werden nie angeschrieben — auch nicht versehentlich in einer Kampagne.',
  category: 'crm',
  readOnly: false,
  input: z.object({
    aktion: z.enum(['hinzufuegen', 'entfernen', 'anzeigen']),
    bereich: z.enum(['email', 'domain', 'firma']).optional(),
    wert: z.string().optional(),
    grund: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    if (input.aktion === 'anzeigen') {
      return ok({
        eintraege: ctx.repos.suppression.list().map((s) => ({
          id: s.id,
          bereich: s.scope,
          wert: s.value_norm,
          grund: s.reason,
          seit: s.created_at,
        })),
      });
    }
    if (!input.bereich || !input.wert) {
      return err('INVALID_INPUT', 'Für Hinzufügen und Entfernen werden Bereich und Wert benötigt.');
    }
    if (input.aktion === 'hinzufuegen') {
      const row = ctx.repos.suppression.add({
        scope: input.bereich,
        value: input.wert,
        ...(input.grund ? { reason: input.grund } : {}),
        source: 'manuell',
      });
      ctx.audit.log({
        actor: ctx.actor,
        action: 'sperrliste.ergaenzt',
        summary: `Sperrliste ergänzt: ${row.scope} "${row.value_norm}"${row.reason ? ` (${row.reason})` : ''}`,
      });
      return ok({ hinzugefuegt: { id: row.id, bereich: row.scope, wert: row.value_norm } });
    }
    const treffer = ctx.repos.suppression.find(input.bereich, input.wert);
    if (!treffer) return err('NOT_FOUND', `"${input.wert}" steht nicht auf der Sperrliste.`);
    ctx.repos.suppression.remove(treffer.id);
    ctx.audit.log({
      actor: ctx.actor,
      action: 'sperrliste.entfernt',
      summary: `Sperrlisteneintrag entfernt: ${treffer.scope} "${treffer.value_norm}"`,
    });
    return ok({ entfernt: treffer.value_norm });
  },
});

export const crmTools: AnyTool[] = [
  findCompanyTool,
  companyDossierTool,
  createCampaignTool,
  researchCampaignTool,
  draftCampaignTool,
  draftSingleTool,
  sendingCenterTool,
  listCampaignsTool,
  suppressionTool,
];
