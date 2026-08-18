import { z } from 'zod/v4';
import { err, makeError, ok } from '../../shared/types.js';
import { defineTool } from './Tool.js';
import { createSearchProvider } from '../research/search.js';
import { verifyAddress, registrableDomain } from '../research/EmailVerifier.js';
import { formatDe } from '../util/id.js';

export const searchWebTool = defineTool({
  name: 'search_web',
  agent: 'CompanyResearchAgent',
  description:
    'Durchsucht das Web über den eingestellten Suchanbieter und liefert Titel, URL und Textausschnitt der Treffer. Für die eigentliche Unternehmensrecherche ist research_companies besser geeignet.',
  schema: z.object({
    query: z.string().min(2).describe('Suchanfrage, z. B. "Bauunternehmen Hamburg Hochbau"'),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  summarize: (input) => `Websuche „${input.query}"`,
  async run(input, context) {
    const settings = context.services.settings.get();
    const provider = createSearchProvider(settings.research, context.services.credentials);
    if (!provider.ok) return provider;
    context.status(`Suche: ${input.query}`);
    const hits = await provider.value.search(input.query, input.limit);
    if (!hits.ok) return hits;
    context.services.audit.log({
      actor: 'jarvis',
      agent: 'CompanyResearchAgent',
      action: 'websuche',
      outcome: 'ok',
      detail: `„${input.query}" → ${hits.value.length} Treffer (${provider.value.name})`,
    });
    return ok({
      provider: provider.value.name,
      results: hits.value.map((hit) => ({ title: hit.title, url: hit.url, snippet: hit.snippet })),
    });
  },
});

export const openWebsiteTool = defineTool({
  name: 'open_website',
  agent: 'BrowserAgent',
  description:
    'Lädt eine öffentliche Webseite und gibt Titel, Text und die dort gefundenen E-Mail-Adressen zurück. Setze show=true, um die Seite zusätzlich im Standardbrowser des Benutzers zu öffnen.',
  schema: z.object({
    url: z.string().url(),
    show: z.boolean().default(false).describe('Zusätzlich im Browser des Benutzers öffnen'),
    maxChars: z.number().int().min(500).max(20000).default(6000),
  }),
  summarize: (input) => `Webseite lesen: ${input.url}`,
  async run(input, context) {
    context.status(`Lese ${input.url}`);
    const page = await context.agents.browser.read(input.url, input.maxChars);
    if (!page.ok) return page;
    if (input.show) {
      const opened = await context.agents.browser.open(input.url);
      if (!opened.ok) return opened;
    }
    return ok(page.value);
  },
});

export const researchCompaniesTool = defineTool({
  name: 'research_companies',
  agent: 'CompanyResearchAgent',
  description:
    'Vollständige Unternehmensrecherche: sucht passende Firmen, ruft Website, Kontakt- und Impressumsseite ab, liest die dort veröffentlichten Kontaktdaten aus, bewertet jede E-Mail-Adresse und legt alles mit Quellenangabe in der Datenbank ab. Erfindet keine Adressen.',
  schema: z.object({
    query: z
      .string()
      .min(3)
      .describe('Zielgruppe in natürlicher Sprache, z. B. "Bauunternehmen Hochbau"'),
    region: z.string().optional().describe('Ort oder Region, z. B. "Hamburg"'),
    limit: z.number().int().min(1).max(50).default(10),
    campaignId: z.number().int().optional(),
  }),
  summarize: (input) =>
    `Recherche: ${input.limit} × „${input.query}"${input.region ? ` in ${input.region}` : ''}`,
  async run(input, context) {
    const outcome = await context.agents.research.research(
      {
        query: input.query,
        region: input.region,
        limit: input.limit,
        campaignId: input.campaignId ?? null,
      },
      (message) => context.status(message),
    );
    if (!outcome.ok) return outcome;
    return ok({
      gefunden: outcome.value.found,
      neu: outcome.value.created,
      aktualisiert: outcome.value.updated,
      mitVerifizierterAdresse: outcome.value.withVerifiedEmail,
      ohneVerifizierteAdresse: outcome.value.found - outcome.value.withVerifiedEmail,
      uebersprungen: outcome.value.skipped,
    });
  },
});

export const extractCompanyInformationTool = defineTool({
  name: 'extract_company_information',
  agent: 'CompanyResearchAgent',
  description:
    'Gibt den gespeicherten Datensatz eines Unternehmens zurück: Fakten mit Quellen, Ansprechpartner, alle gefundenen E-Mail-Adressen mit Verifizierungsstatus und Begründung.',
  schema: z.object({
    companyId: z.number().int().optional(),
    name: z.string().optional().describe('Alternativ zur ID: Firmenname oder Teil davon'),
  }),
  summarize: (input) => `Unternehmensdaten: ${input.name ?? `#${input.companyId}`}`,
  async run(input, context) {
    const id = input.companyId ?? context.repos.companies.search(input.name ?? '', 1)[0]?.id;
    if (!id) {
      return err(
        makeError('research.company_not_found', `Kein Unternehmen zu „${input.name ?? input.companyId}" gefunden.`),
      );
    }
    const dossier = context.repos.companies.dossier(id);
    if (!dossier) return err(makeError('research.company_not_found', `Unternehmen ${id} existiert nicht.`));

    return ok({
      id: dossier.company.id,
      name: dossier.company.name,
      website: dossier.company.website,
      standort: dossier.company.city,
      branche: dossier.company.industry,
      beschreibung_fakt: dossier.company.description,
      telefon: dossier.company.phone,
      status: dossier.company.status,
      ki_einschaetzung: dossier.company.outreachRationale,
      nicht_kontaktieren: dossier.company.doNotContact,
      letzterKontakt: formatDe(dossier.company.lastContactAt),
      ansprechpartner: dossier.contacts.map((contact) => ({
        name: contact.fullName,
        position: contact.role,
        telefon: contact.phone,
        quelle: contact.sourceUrl,
      })),
      emailAdressen: dossier.emails.map((email) => ({
        adresse: email.address,
        status: email.status,
        begruendung: email.reason,
        quelle: email.sourceUrl,
        mxGeprueft: email.mxChecked,
        mxVorhanden: email.mxOk,
      })),
      quellen: dossier.sources.map((source) => ({
        url: source.url,
        art: source.kind,
        abgerufen: source.retrievedAt,
      })),
      hinweis:
        dossier.emails.some((email) => email.status === 'VERIFIZIERT')
          ? undefined
          : 'Keine verifizierte E-Mail-Adresse gefunden.',
    });
  },
});

export const verifyEmailTool = defineTool({
  name: 'verify_email',
  agent: 'CompanyResearchAgent',
  description:
    'Bewertet eine konkrete E-Mail-Adresse: Syntax, Rollen-/Systemadresse, Domainabgleich mit der Unternehmenswebsite und MX-Eintrag. Prüft nur übergebene Adressen und erzeugt selbst keine.',
  schema: z.object({
    address: z.string().min(5),
    sourceUrl: z.string().url().describe('Seite, auf der die Adresse gefunden wurde'),
    sourceKind: z.enum(['website', 'kontakt', 'impressum', 'suchmaschine', 'sonstige']).default('sonstige'),
    companyDomain: z.string().optional(),
  }),
  summarize: (input) => `Adresse prüfen: ${input.address}`,
  async run(input, context) {
    context.status(`Prüfe ${input.address}`);
    const verdict = await verifyAddress({
      address: input.address,
      sourceUrl: input.sourceUrl,
      sourceKind: input.sourceKind,
      origin: 'text',
      companyDomain: input.companyDomain ?? registrableDomain(input.sourceUrl),
    });
    return ok({
      adresse: input.address,
      status: verdict.status,
      begruendung: verdict.reason,
      rollenadresse: verdict.role,
      mxGeprueft: verdict.mxChecked,
      mxVorhanden: verdict.mxOk,
      versandErlaubt: verdict.status === 'VERIFIZIERT',
    });
  },
});

export const listCompaniesTool = defineTool({
  name: 'list_companies',
  agent: 'CompanyResearchAgent',
  description:
    'Listet gespeicherte Unternehmen mit Status, bester E-Mail-Adresse und letztem Kontakt. Nützlich, um zu prüfen, wer bereits angeschrieben wurde.',
  schema: z.object({
    search: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(25),
    onlyWithVerifiedEmail: z.boolean().default(false),
  }),
  summarize: (input) => `Unternehmen auflisten${input.search ? `: „${input.search}"` : ''}`,
  async run(input, context) {
    const companies = input.search
      ? context.repos.companies.search(input.search, input.limit)
      : context.repos.companies.list(input.limit);

    const rows = companies.map((company) => {
      const best = context.repos.companies.bestEmailAddress(company.id, false);
      return {
        id: company.id,
        name: company.name,
        status: company.status,
        standort: company.city,
        email: best?.address ?? null,
        emailStatus: best?.status ?? null,
        letzterKontakt: formatDe(company.lastContactAt),
        nichtKontaktieren: company.doNotContact,
      };
    });

    return ok(
      input.onlyWithVerifiedEmail ? rows.filter((row) => row.emailStatus === 'VERIFIZIERT') : rows,
    );
  },
});

export const markDoNotContactTool = defineTool({
  name: 'mark_do_not_contact',
  agent: 'CompanyResearchAgent',
  description:
    'Setzt oder entfernt die Sperre „nicht kontaktieren" für ein Unternehmen. Gesperrte Unternehmen werden bei Recherche und Akquise übersprungen.',
  schema: z.object({
    companyId: z.number().int(),
    value: z.boolean().default(true),
    reason: z.string().optional(),
  }),
  summarize: (input) =>
    `${input.value ? 'Sperre setzen' : 'Sperre aufheben'} für Unternehmen #${input.companyId}`,
  async run(input, context) {
    const company = context.repos.companies.get(input.companyId);
    if (!company) {
      return err(makeError('research.company_not_found', `Unternehmen ${input.companyId} existiert nicht.`));
    }
    context.repos.companies.setDoNotContact(input.companyId, input.value, input.reason);
    context.services.audit.log({
      actor: 'benutzer',
      agent: 'CompanyResearchAgent',
      action: input.value ? 'sperre.gesetzt' : 'sperre.aufgehoben',
      subject: `company:${input.companyId}`,
      outcome: 'ok',
      detail: input.reason,
    });
    return ok({ unternehmen: company.name, gesperrt: input.value, grund: input.reason ?? null });
  },
});

export const addSuppressionTool = defineTool({
  name: 'add_to_suppression_list',
  agent: 'CompanyResearchAgent',
  description:
    'Trägt eine E-Mail-Adresse oder eine ganze Domain in die Sperrliste ein (Opt-out). Einträge auf der Sperrliste werden nie angeschrieben.',
  schema: z.object({
    pattern: z.string().min(3).describe('Adresse oder Domain'),
    kind: z.enum(['address', 'domain']).default('address'),
    reason: z.string().optional(),
  }),
  summarize: (input) => `Sperrliste: ${input.pattern}`,
  async run(input, context) {
    context.repos.companies.suppress(input.pattern, input.kind, input.reason);
    context.services.audit.log({
      actor: 'benutzer',
      action: 'sperrliste.ergaenzt',
      subject: input.pattern,
      outcome: 'ok',
      detail: input.reason,
    });
    return ok({ eingetragen: input.pattern, art: input.kind });
  },
});
