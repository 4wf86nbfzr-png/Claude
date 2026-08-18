import { z } from 'zod';
import { defineTool, type AnyTool } from './types.js';
import { err, ok } from '../util/result.js';
import { truncate } from '../util/text.js';
import { checkMx, classifyAddress, isSyntacticallyValid } from '../research/verify.js';

/**
 * Recherche-Werkzeuge.
 *
 * `verify_email` ist bewusst *keine* Adressgenerierung: das Tool prueft eine
 * vorhandene Adresse gegen eine belegte Fundstelle. Es gibt im gesamten
 * Projekt keinen Weg, eine Adresse zu erfinden.
 */

export const searchWebTool = defineTool({
  name: 'search_web',
  description:
    'Durchsucht das Web und liefert Titel, URL und Textausschnitt der Treffer. Für allgemeine Fragen und zum Auffinden von Unternehmensseiten.',
  category: 'recherche',
  readOnly: true,
  input: z.object({
    suchbegriff: z.string().min(2).describe('Die Suchanfrage, so wie man sie eintippen würde.'),
    anzahl: z.number().int().min(1).max(20).optional().describe('Wie viele Treffer, Standard 10.'),
  }),
  handler: async (input, ctx) => {
    const r = await ctx.research.search(input.suchbegriff, input.anzahl ?? 10, ctx.signal);
    if (!r.ok) return r;
    return ok({
      anbieter: ctx.research.providerLabel,
      treffer: r.data.map((h) => ({ rang: h.rank, titel: h.title, url: h.url, ausschnitt: truncate(h.snippet, 300) })),
    });
  },
  summarize: (input, result) =>
    result.ok
      ? `Suche "${truncate(input.suchbegriff, 40)}": ${(result.data as { treffer: unknown[] }).treffer.length} Treffer`
      : `Suche fehlgeschlagen: ${result.error.message}`,
});

export const openWebsiteTool = defineTool({
  name: 'open_website',
  description:
    'Lädt eine Webseite und gibt ihren Textinhalt sowie gefundene Kontakt- und Impressumslinks zurück. Beachtet robots.txt.',
  category: 'recherche',
  readOnly: true,
  input: z.object({
    url: z.string().url().describe('Vollständige http(s)-Adresse.'),
    maxZeichen: z.number().int().min(500).max(30_000).optional(),
  }),
  handler: async (input, ctx) => {
    const page = await ctx.research.fetchPage(input.url, 'website', ctx.signal);
    if (!page.ok) return page;
    const { extractFromPage } = await import('../research/extract.js');
    const extract = extractFromPage(page.data);
    return ok({
      url: page.data.finalUrl,
      titel: page.data.title,
      status: page.data.status,
      abgerufenAm: page.data.fetchedAt,
      text: truncate(page.data.text, input.maxZeichen ?? 8000),
      gefundeneAdressen: extract.emails.map((e) => e.address),
      verschleierteAdressen: extract.obfuscatedEmails.map((o) => o.raw),
      telefon: extract.phones.map((p) => p.number),
      rechtlicheSeiten: extract.legalLinks,
    });
  },
  summarize: (input, result) => (result.ok ? `Seite geladen: ${input.url}` : `Seite nicht ladbar: ${result.error.message}`),
});

export const extractCompanyInformationTool = defineTool({
  name: 'extract_company_information',
  description:
    'Recherchiert ein Unternehmen gründlich: lädt Website, Kontaktseite und Impressum, sammelt belegte Angaben, Ansprechpartner und E-Mail-Adressen mit Quelle und speichert alles in der Firmendatenbank.',
  category: 'recherche',
  readOnly: false,
  input: z.object({
    firmenname: z.string().min(2),
    website: z.string().url().describe('Startseite des Unternehmens.'),
    ort: z.string().optional(),
    branche: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const r = await ctx.research.profileCompany(
      {
        name: input.firmenname,
        website: input.website,
        ort: input.ort ?? null,
        branche: input.branche ?? null,
      },
      ctx.signal,
    );
    if (!r.ok) return r;
    const p = r.data;
    return ok({
      firmaId: p.company.id,
      name: p.company.name,
      website: p.company.website,
      ort: p.company.city,
      anschrift: [p.company.street, p.company.postal_code, p.company.city].filter(Boolean).join(', ') || null,
      telefon: p.phone,
      adressen: p.emails,
      verschleierteAdressen: p.verschleierteAdressen,
      ansprechpartner: p.contacts,
      fakten: p.fakten,
      besuchteSeiten: p.besuchteSeiten,
      hinweise: p.hinweise,
      verifizierteAdresseVorhanden: p.emails.some((e) => e.verification === 'VERIFIZIERT'),
    });
  },
  summarize: (input, result) =>
    result.ok
      ? `${input.firmenname}: ${(result.data as { adressen: unknown[] }).adressen.length} Adresse(n) gefunden`
      : `${input.firmenname}: ${result.error.message}`,
});

export const findCompaniesTool = defineTool({
  name: 'find_companies',
  description:
    'Sucht Unternehmenswebsites zu einer Branche und einem Ort. Liefert Kandidaten mit Name und Website; Verzeichnisse und Portale werden aussortiert. Speichert noch nichts.',
  category: 'recherche',
  readOnly: true,
  input: z.object({
    branche: z.string().min(2).describe('z. B. "Bauunternehmen" oder "Hochbau"'),
    ort: z.string().optional().describe('z. B. "Hamburg"'),
    zusatz: z.string().optional().describe('Weitere Eingrenzung, z. B. "Rohbau" oder "Projektentwicklung".'),
    anzahl: z.number().int().min(1).max(50).optional(),
  }),
  handler: async (input, ctx) => {
    const r = await ctx.research.findCompanyCandidates(
      {
        branche: input.branche,
        ...(input.ort ? { ort: input.ort } : {}),
        ...(input.zusatz ? { zusatz: input.zusatz } : {}),
        limit: input.anzahl ?? 15,
      },
      ctx.signal,
    );
    if (!r.ok) return r;
    return ok({ kandidaten: r.data, anzahl: r.data.length });
  },
  summarize: (input, result) =>
    result.ok
      ? `${(result.data as { anzahl: number }).anzahl} Firmenkandidaten für "${input.branche}${input.ort ? ` in ${input.ort}` : ''}"`
      : `Firmensuche fehlgeschlagen: ${result.error.message}`,
});

export const verifyEmailTool = defineTool({
  name: 'verify_email',
  description:
    'Prüft eine bereits gefundene E-Mail-Adresse: Syntax, Erreichbarkeit der Domain (MX-Eintrag) und Herkunft. Erzeugt niemals selbst eine Adresse und rät nicht.',
  category: 'recherche',
  readOnly: true,
  input: z.object({
    adresse: z.string().describe('Die zu prüfende Adresse, wörtlich wie gefunden.'),
    gefundenAufUrl: z.string().url().optional().describe('Seite, auf der die Adresse wörtlich stand.'),
    firmenWebsite: z.string().url().optional(),
    quellenart: z.enum(['website', 'impressum', 'kontakt', 'suchtreffer', 'drittquelle', 'manuell']).optional(),
  }),
  handler: async (input, ctx) => {
    if (!isSyntacticallyValid(input.adresse)) {
      return ok({
        adresse: input.adresse,
        status: 'NICHT_VERIFIZIERT',
        begruendung: 'Die Adresse ist syntaktisch nicht gültig.',
        mxErreichbar: null,
      });
    }
    const mxOk = await checkMx(input.adresse);
    const bekannt = ctx.repos.companies.findEmailAddress(input.adresse);
    const klass = classifyAddress({
      address: input.adresse,
      foundOnUrl: input.gefundenAufUrl ?? bekannt?.found_on_url ?? null,
      companyWebsite: input.firmenWebsite ?? null,
      sourceKind: input.quellenart ?? 'drittquelle',
      mxOk,
    });
    return ok({
      adresse: input.adresse,
      status: klass.status,
      begruendung: klass.note,
      mxErreichbar: mxOk,
      inDatenbank: Boolean(bekannt),
      gespeicherterStatus: bekannt?.verification ?? null,
    });
  },
  summarize: (input, result) =>
    result.ok ? `${input.adresse}: ${(result.data as { status: string }).status}` : `Prüfung fehlgeschlagen: ${result.error.message}`,
});

export const addEmailAddressTool = defineTool({
  name: 'add_email_address',
  description:
    'Trägt eine E-Mail-Adresse mit Herkunftsnachweis zu einer Firma ein. Nur verwenden, wenn die Adresse wörtlich auf einer Seite stand oder vom Benutzer genannt wurde. Niemals eine Adresse aus einem Namensschema ableiten.',
  category: 'crm',
  readOnly: false,
  input: z.object({
    firmaId: z.string(),
    adresse: z.string(),
    gefundenAufUrl: z.string().url().optional(),
    quellenart: z.enum(['website', 'impressum', 'kontakt', 'suchtreffer', 'drittquelle', 'manuell']),
    beleg: z.string().optional().describe('Textstelle, an der die Adresse stand.'),
  }),
  handler: async (input, ctx) => {
    const firma = ctx.repos.companies.get(input.firmaId);
    if (!firma) return err('NOT_FOUND', `Firma ${input.firmaId} existiert nicht.`);
    if (!isSyntacticallyValid(input.adresse)) {
      return err('INVALID_INPUT', `"${input.adresse}" ist keine gültige E-Mail-Adresse.`);
    }
    if (input.quellenart !== 'manuell' && !input.gefundenAufUrl) {
      return err('INVALID_INPUT', 'Ohne Fundstelle darf keine Adresse gespeichert werden.', {
        hint: 'Entweder gefundenAufUrl angeben oder quellenart auf "manuell" setzen.',
      });
    }

    const mxOk = await checkMx(input.adresse);
    const klass = classifyAddress({
      address: input.adresse,
      foundOnUrl: input.gefundenAufUrl ?? null,
      companyWebsite: firma.website,
      sourceKind: input.quellenart,
      mxOk,
    });

    const source = ctx.repos.companies.addSource({
      url: input.gefundenAufUrl ?? firma.website ?? 'manuell',
      kind: input.quellenart,
      snippet: input.beleg ?? null,
    });
    const row = ctx.repos.companies.addEmailAddress({
      address: input.adresse,
      companyId: firma.id,
      verification: klass.status,
      verifyNote: klass.note,
      mxOk,
      sourceId: source.id,
      foundOnUrl: input.gefundenAufUrl ?? null,
    });

    ctx.audit.log({
      actor: ctx.agent,
      action: 'crm.adresse_ergaenzt',
      summary: `E-Mail-Adresse ${row.address} zu ${firma.name} ergänzt (${row.verification})`,
      entityType: 'company',
      entityId: firma.id,
    });
    ctx.bus.emit('invalidate', { scope: 'companies' });
    return ok({ adresse: row.address, status: row.verification, begruendung: row.verify_note });
  },
});

export const researchTools: AnyTool[] = [
  searchWebTool,
  openWebsiteTool,
  findCompaniesTool,
  extractCompanyInformationTool,
  verifyEmailTool,
  addEmailAddressTool,
];
