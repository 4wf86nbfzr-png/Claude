import { z } from 'zod';
import { ClaimKind, VerificationStatus } from '../../../shared/status';
import type { Company } from '../../../shared/types';
import type { FirmenRecherche } from '../../research';
import { bewerteAdresse, pruefeMx } from '../../research/verification';
import { normalizeDomain, truncate } from '../../util/text';
import { fail, ok, type ToolContext, type ToolDefinition } from '../types';

/**
 * Speichert eine Recherche vollständig ab: Quellen, Unternehmen, Fakten,
 * Ansprechpartner und bewertete Adressen. Jede Aussage bekommt ihre Quelle –
 * ohne Quelle wird nichts als Fakt abgelegt (§15).
 */
export function speichereRecherche(
  context: ToolContext,
  recherche: FirmenRecherche,
  zusatz: { branche?: string | null; ort?: string | null } = {}
): { company: Company; neu: boolean; verifizierte: number } {
  const { repos } = context;
  const quellenIds = new Map<string, number>();
  for (const quelle of recherche.quellen) {
    const gespeichert = repos.sources.record({
      url: quelle.url,
      kind: quelle.kind,
      title: quelle.title,
      httpStatus: quelle.httpStatus,
      excerpt: quelle.excerpt
    });
    quellenIds.set(quelle.url, gespeichert.id);
  }

  const { company, created } = repos.companies.upsert({
    name: recherche.name ?? recherche.domain ?? recherche.startUrl,
    website: recherche.startUrl,
    city: recherche.ort ?? zusatz.ort ?? null,
    industry: zusatz.branche ?? null,
    description: recherche.beschreibung
  });

  const startQuelle = quellenIds.get(recherche.quellen[0]?.url ?? '') ?? null;
  if (recherche.beschreibung) {
    repos.companies.addClaim(
      company.id,
      ClaimKind.FAKT,
      `Selbstbeschreibung auf der Website: ${truncate(recherche.beschreibung, 240)}`,
      startQuelle
    );
  }
  if (recherche.telefon.length > 0) {
    repos.companies.addClaim(
      company.id,
      ClaimKind.FAKT,
      `Öffentlich angegebene Telefonnummer: ${recherche.telefon[0]}`,
      startQuelle
    );
  }

  for (const kontakt of recherche.kontakte) {
    repos.contacts.upsert({
      companyId: company.id,
      fullName: kontakt.name,
      role: kontakt.role,
      phone: recherche.telefon[0] ?? null,
      sourceId: startQuelle
    });
  }

  let verifizierte = 0;
  for (const adresse of recherche.emails) {
    const kontakt = repos.contacts
      .forCompany(company.id)
      .find((k) => passtZuAdresse(k.fullName, adresse.address));
    repos.addresses.upsert({
      companyId: company.id,
      contactId: kontakt?.id ?? null,
      address: adresse.address,
      verificationStatus: adresse.status,
      verificationMethod: adresse.method,
      evidenceUrl: adresse.evidenceUrl,
      evidenceSnippet: adresse.evidenceSnippet,
      sourceId: quellenIds.get(adresse.evidenceUrl) ?? null
    });
    if (adresse.status === VerificationStatus.VERIFIZIERT) verifizierte++;
  }

  return { company, neu: created, verifizierte };
}

/** Grobe Zuordnung "m.mustermann@" ↔ "Max Mustermann". */
function passtZuAdresse(name: string, address: string): boolean {
  const lokal = address.split('@')[0]?.toLowerCase() ?? '';
  const teile = name
    .toLowerCase()
    .split(/\s+/)
    .filter((teil) => teil.length > 2);
  const nachname = teile[teile.length - 1];
  return Boolean(nachname && lokal.includes(nachname));
}

const sucheSchema = z.object({
  query: z.string().min(3).describe('Suchanfrage, z. B. "Bauunternehmen Hamburg Hochbau"'),
  maxResults: z.number().int().min(1).max(20).optional().describe('Höchstzahl der Treffer (Standard 10)')
});

const searchWeb: ToolDefinition = {
  name: 'search_web',
  agent: 'CompanyResearchAgent',
  description:
    'Durchsucht das Web über den eingerichteten Suchdienst und gibt Titel, Adresse und Textausschnitt der Treffer zurück. ' +
    'Erfindet keine Treffer; ohne eingerichteten Suchdienst kommt eine Fehlermeldung.',
  schema: sucheSchema,
  execute: async (input, context) => {
    const { query, maxResults } = input as z.infer<typeof sucheSchema>;
    if (!context.research.search.configured()) {
      return fail(`Keine Websuche eingerichtet. ${context.research.search.missingHint()}`);
    }
    try {
      const treffer = await context.research.suchen(query, maxResults);
      for (const hit of treffer) {
        context.repos.sources.record({ url: hit.url, kind: 'suche', title: hit.title, excerpt: hit.snippet });
      }
      return ok(`${treffer.length} Treffer zu „${query}“.`, { anzahl: treffer.length, treffer });
    } catch (error) {
      return fail(`Die Suche ist fehlgeschlagen: ${(error as Error).message}`);
    }
  }
};

const openWebsiteSchema = z.object({
  url: z.string().url().describe('Vollständige Adresse der Seite'),
  maxZeichen: z.number().int().min(500).max(20000).optional().describe('Wie viel Text zurückgegeben wird')
});

const openWebsite: ToolDefinition = {
  name: 'open_website',
  agent: 'BrowserAgent',
  description:
    'Ruft eine Webseite ab und gibt ihren lesbaren Text zurück. Beachtet robots.txt und liefert bei Sperren oder Fehlern eine ehrliche Fehlermeldung.',
  schema: openWebsiteSchema,
  execute: async (input, context) => {
    const { url, maxZeichen } = input as z.infer<typeof openWebsiteSchema>;
    const ergebnis = await context.research.seitentext(url, maxZeichen ?? 8000);
    if (!ergebnis.ok) return fail(`Seite ${url} konnte nicht gelesen werden: ${ergebnis.fehler}`);
    context.repos.sources.record({ url, kind: 'website', title: ergebnis.titel, excerpt: ergebnis.text });
    return ok(`Seite ${url} gelesen (${ergebnis.text.length} Zeichen).`, {
      url,
      titel: ergebnis.titel,
      text: ergebnis.text
    });
  }
};

const extractSchema = z.object({
  url: z.string().url().describe('Adresse der Unternehmenswebsite (Startseite genügt)'),
  branche: z.string().optional().describe('Branche, falls aus dem Auftrag bekannt'),
  ort: z.string().optional().describe('Ort, falls aus dem Auftrag bekannt')
});

const extractCompanyInformation: ToolDefinition = {
  name: 'extract_company_information',
  agent: 'CompanyResearchAgent',
  description:
    'Liest eine Unternehmenswebsite samt Kontakt- und Impressumsseite aus, legt das Unternehmen in der Datenbank an ' +
    'und bewertet jede gefundene E-Mail-Adresse als VERIFIZIERT, WAHRSCHEINLICH oder NICHT_VERIFIZIERT. ' +
    'Adressen werden nie geraten.',
  schema: extractSchema,
  execute: async (input, context) => {
    const { url, branche, ort } = input as z.infer<typeof extractSchema>;
    const recherche = await context.research.firmenprofil(url);
    if (!recherche.ok) return fail(`Recherche zu ${url} fehlgeschlagen: ${recherche.fehler}`);

    const { company, neu, verifizierte } = speichereRecherche(context, recherche, {
      branche: branche ?? null,
      ort: ort ?? null
    });

    const adressen = context.repos.addresses.forCompany(company.id);
    return ok(
      verifizierte > 0
        ? `${company.name}: ${verifizierte} verifizierte Adresse(n) gefunden.`
        : `${company.name}: keine verifizierte E-Mail-Adresse gefunden.`,
      {
        companyId: company.id,
        name: company.name,
        neuAngelegt: neu,
        website: company.website,
        ort: company.city,
        beschreibung: company.description,
        telefon: recherche.telefon,
        ansprechpartner: context.repos.contacts.forCompany(company.id),
        emails: adressen.map((adresse) => ({
          address: adresse.address,
          status: adresse.verificationStatus,
          quelle: adresse.evidenceUrl,
          verfahren: adresse.verificationMethod
        })),
        hinweis:
          verifizierte === 0 ? 'Keine verifizierte E-Mail-Adresse gefunden' : undefined,
        quellen: recherche.quellen.map((q) => q.url),
        nichtGelesen: recherche.nichtGelesen
      }
    );
  }
};

const verifySchema = z.object({
  address: z.string().describe('Zu prüfende E-Mail-Adresse'),
  evidenceUrl: z.string().url().optional().describe('Seite, auf der die Adresse wörtlich steht'),
  companyDomain: z.string().optional().describe('Offizielle Domain des Unternehmens'),
  seitenart: z
    .enum(['impressum', 'kontakt', 'website', 'verzeichnis', 'unbekannt'])
    .optional()
    .describe('Art der Belegseite')
});

const verifyEmail: ToolDefinition = {
  name: 'verify_email',
  agent: 'CompanyResearchAgent',
  description:
    'Bewertet eine E-Mail-Adresse: Syntax, DNS-Erreichbarkeit der Domain und Beweiskraft der Quelle. ' +
    'Ohne Quellenangabe ist das Ergebnis immer NICHT_VERIFIZIERT.',
  schema: verifySchema,
  execute: async (input, context) => {
    const { address, evidenceUrl, companyDomain, seitenart } = input as z.infer<typeof verifySchema>;
    const mx = await pruefeMx(address);
    const bewertung = bewerteAdresse({
      address,
      evidenceUrl: evidenceUrl ?? null,
      companyDomain: companyDomain ? normalizeDomain(companyDomain) : null,
      fundart: evidenceUrl ? 'klartext' : 'vermutung',
      seitenart: seitenart ?? (evidenceUrl ? 'unbekannt' : 'unbekannt'),
      mxVorhanden: mx.ok
    });
    const bekannt = context.repos.addresses.findByAddress(address);
    for (const eintrag of bekannt) {
      context.repos.addresses.upsert({
        companyId: eintrag.companyId,
        address,
        verificationStatus: bewertung.status,
        verificationMethod: bewertung.method,
        evidenceUrl: evidenceUrl ?? eintrag.evidenceUrl,
        contactId: eintrag.contactId
      });
    }
    return ok(`${address}: ${bewertung.status}. ${bewertung.begruendung}`, {
      address,
      status: bewertung.status,
      begruendung: bewertung.begruendung,
      mxVorhanden: mx.ok,
      mxHosts: mx.hosts,
      versandErlaubt: bewertung.status === VerificationStatus.VERIFIZIERT
    });
  }
};

const rechercheSchema = z.object({
  branche: z.string().describe('Branche oder Suchbegriff, z. B. "Bauunternehmen Hochbau"'),
  region: z.string().describe('Ort oder Region, z. B. "Hamburg"'),
  anzahl: z.number().int().min(1).max(30).optional().describe('Wie viele Unternehmen recherchiert werden sollen'),
  nurMitVerifizierterAdresse: z
    .boolean()
    .optional()
    .describe('Wenn true, werden Unternehmen ohne verifizierte Adresse nicht zurückgegeben')
});

const researchCompanies: ToolDefinition = {
  name: 'research_companies',
  agent: 'CompanyResearchAgent',
  description:
    'Sucht Unternehmen zu Branche und Region, ruft jede Website auf, legt die Unternehmen an und bewertet die ' +
    'gefundenen Kontaktadressen. Meldet ehrlich, für wie viele Unternehmen keine verifizierte Adresse gefunden wurde.',
  schema: rechercheSchema,
  execute: async (input, context) => {
    const { branche, region, anzahl, nurMitVerifizierterAdresse } = input as z.infer<typeof rechercheSchema>;
    const ziel = anzahl ?? 10;
    if (!context.research.search.configured()) {
      return fail(`Keine Websuche eingerichtet. ${context.research.search.missingHint()}`);
    }

    let treffer;
    try {
      treffer = await context.research.suchen(`${branche} ${region}`, Math.min(20, ziel * 2));
    } catch (error) {
      return fail(`Die Suche ist fehlgeschlagen: ${(error as Error).message}`);
    }

    const ergebnisse: Record<string, unknown>[] = [];
    const gesehen = new Set<string>();
    const uebersprungen: { url: string; grund: string }[] = [];

    for (const hit of treffer) {
      if (ergebnisse.length >= ziel) break;
      const domain = normalizeDomain(hit.url);
      if (!domain || gesehen.has(domain)) continue;
      if (istVerzeichnis(domain)) {
        uebersprungen.push({ url: hit.url, grund: 'Branchenverzeichnis, kein Unternehmen' });
        continue;
      }
      gesehen.add(domain);

      context.bus.emit({ kind: 'progress', text: `Recherchiere ${domain} …` });
      const recherche = await context.research.firmenprofil(`https://${domain}`);
      if (!recherche.ok) {
        uebersprungen.push({ url: hit.url, grund: recherche.fehler ?? 'nicht lesbar' });
        continue;
      }
      const { company, verifizierte } = speichereRecherche(context, recherche, { branche, ort: region });
      if (nurMitVerifizierterAdresse && verifizierte === 0) {
        uebersprungen.push({ url: hit.url, grund: 'keine verifizierte Adresse' });
        continue;
      }
      const beste = context.repos.addresses.best(company.id, VerificationStatus.WAHRSCHEINLICH);
      ergebnisse.push({
        companyId: company.id,
        name: company.name,
        website: company.website,
        ort: company.city,
        email: beste?.address ?? null,
        status: beste?.verificationStatus ?? 'NICHT_VERIFIZIERT',
        quelle: beste?.evidenceUrl ?? null,
        hinweis: beste ? undefined : 'Keine verifizierte E-Mail-Adresse gefunden'
      });
    }

    const mitAdresse = ergebnisse.filter((e) => e.status === VerificationStatus.VERIFIZIERT).length;
    return ok(
      `${ergebnisse.length} Unternehmen recherchiert, davon ${mitAdresse} mit verifizierter Kontaktadresse.`,
      { gefunden: ergebnisse.length, mitVerifizierterAdresse: mitAdresse, unternehmen: ergebnisse, uebersprungen }
    );
  }
};

/** Bekannte Verzeichnisse – aus denen entsteht kein Firmenprofil. */
function istVerzeichnis(domain: string): boolean {
  const verzeichnisse = [
    'gelbeseiten.de',
    'dasoertliche.de',
    '11880.com',
    'wlw.de',
    'werliefertwas.de',
    'yelp.de',
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'xing.com',
    'wikipedia.org',
    'youtube.com',
    'indeed.com',
    'stepstone.de',
    'kununu.com',
    'northdata.de',
    'firmenwissen.de',
    'unternehmensregister.de'
  ];
  return verzeichnisse.some((eintrag) => domain === eintrag || domain.endsWith(`.${eintrag}`));
}

export const researchTools: ToolDefinition[] = [
  searchWeb,
  openWebsite,
  extractCompanyInformation,
  verifyEmail,
  researchCompanies
];
