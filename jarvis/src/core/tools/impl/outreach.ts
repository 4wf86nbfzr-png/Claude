import { z } from 'zod';
import { ClaimKind, OutreachStatus, VerificationStatus } from '../../../shared/status';
import { erstelleAkquiseMail } from '../../agents/composer';
import { normalizeDomain } from '../../util/text';
import { fail, ok, type ToolContext, type ToolDefinition, type ToolResult } from '../types';
import { speichereRecherche } from './research';

const kampagneSchema = z.object({
  name: z.string().min(3).describe('Name der Kampagne, z. B. "Hamburger Bauunternehmen"'),
  dienstleistung: z.string().min(3).describe('Angebotene Leistung, z. B. "24/7 Baustellenbewachung"'),
  region: z.string().optional().describe('Region, z. B. "Hamburg"'),
  radiusKm: z.number().int().min(0).max(500).optional(),
  zielanzahl: z.number().int().min(1).max(200).optional().describe('Wie viele qualifizierte Unternehmen angestrebt werden'),
  ziel: z.string().optional().describe('Freitextziel der Kampagne')
});

const createCampaign: ToolDefinition = {
  name: 'create_campaign',
  agent: 'OutreachAgent',
  description: 'Legt eine Akquise-Kampagne an (Leistung, Region, Zielanzahl). Recherchiert noch nichts.',
  schema: kampagneSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof kampagneSchema>;
    const kampagne = context.repos.campaigns.create({
      name: daten.name,
      service: daten.dienstleistung,
      region: daten.region ?? null,
      radiusKm: daten.radiusKm ?? null,
      targetCount: daten.zielanzahl ?? null,
      goal: daten.ziel ?? null
    });
    return ok(`Kampagne „${kampagne.name}“ angelegt (Nr. ${kampagne.id}).`, { campaignId: kampagne.id, kampagne });
  }
};

const vorbereitenSchema = z.object({
  campaignId: z.number().int().describe('Kampagne, für die vorbereitet wird'),
  branche: z.string().describe('Suchbegriff für die Unternehmenssuche, z. B. "Bauunternehmen Hochbau"'),
  anzahl: z.number().int().min(1).max(30).optional().describe('Wie viele Unternehmen bearbeitet werden (Standard 10)'),
  nurEntwuerfeMitVerifizierterAdresse: z
    .boolean()
    .optional()
    .describe('Standard true: Entwürfe entstehen nur für verifizierte Adressen')
});

/**
 * Der Ablauf aus §5 in einem Werkzeug: recherchieren, bereinigen, Dubletten
 * und bereits kontaktierte Unternehmen erkennen, Kontaktdaten prüfen,
 * Begründung erstellen und einen individuellen Entwurf schreiben.
 *
 * Was hier ausdrücklich NICHT passiert: senden. Am Ende steht je Unternehmen
 * ein Entwurf im Status „Entwurf erstellt“.
 */
const prepareOutreach: ToolDefinition = {
  name: 'prepare_outreach',
  agent: 'OutreachAgent',
  description:
    'Führt die komplette Vorbereitung einer Kampagne durch: Unternehmen recherchieren, Dubletten und bereits ' +
    'kontaktierte Firmen aussortieren, Kontaktadressen prüfen, Akquisegrund festhalten und je Unternehmen einen ' +
    'individuellen Entwurf schreiben. Versendet nichts.',
  schema: vorbereitenSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof vorbereitenSchema>;
    const kampagne = context.repos.campaigns.byId(daten.campaignId);
    if (!kampagne) return fail(`Kampagne ${daten.campaignId} existiert nicht.`);
    if (!context.research.search.configured()) {
      return fail(`Keine Websuche eingerichtet. ${context.research.search.missingHint()}`);
    }
    if (!context.llm.configured()) {
      return fail(`Für die Entwürfe wird ein Sprachmodell gebraucht. ${context.llm.missingHint()}`);
    }

    const ziel = daten.anzahl ?? 10;
    const nurVerifiziert = daten.nurEntwuerfeMitVerifizierterAdresse ?? true;
    const region = kampagne.region ?? '';

    let treffer;
    try {
      treffer = await context.research.suchen(`${daten.branche} ${region}`.trim(), Math.min(20, ziel * 2));
    } catch (error) {
      return fail(`Die Suche ist fehlgeschlagen: ${(error as Error).message}`);
    }

    const bericht = {
      recherchiert: 0,
      mitVerifizierterAdresse: 0,
      entwuerfe: 0,
      uebersprungen: [] as { firma: string; grund: string }[],
      zeilen: [] as Record<string, unknown>[]
    };
    const gesehen = new Set(
      context.repos.campaigns
        .targetCompanyIds(kampagne.id)
        .map((id) => context.repos.companies.byId(id)?.domain)
        .filter(Boolean) as string[]
    );

    for (const hit of treffer) {
      if (bericht.recherchiert >= ziel) break;
      const domain = normalizeDomain(hit.url);
      if (!domain || gesehen.has(domain)) continue;
      gesehen.add(domain);

      context.bus.emit({ kind: 'progress', text: `Recherchiere ${domain} …` });
      const recherche = await context.research.firmenprofil(`https://${domain}`);
      if (!recherche.ok) {
        bericht.uebersprungen.push({ firma: domain, grund: recherche.fehler ?? 'Seite nicht lesbar' });
        continue;
      }
      const { company } = speichereRecherche(context, recherche, {
        branche: daten.branche,
        ort: kampagne.region ?? null
      });
      bericht.recherchiert++;

      const frueher = context.repos.emails.lastSentToCompany(company.id);
      if (frueher) {
        context.repos.campaigns.addTarget(kampagne.id, company.id, 'Bereits angeschrieben');
        context.repos.campaigns.setTargetStatus(kampagne.id, company.id, OutreachStatus.KONTAKT_GEFUNDEN, {
          reason: `Bereits am ${frueher.sentAt?.slice(0, 10) ?? 'unbekannt'} angeschrieben`
        });
        bericht.uebersprungen.push({
          firma: company.name,
          grund: `bereits am ${frueher.sentAt?.slice(0, 10) ?? 'unbekannt'} angeschrieben`
        });
        continue;
      }

      const adresse = context.repos.addresses.best(company.id, VerificationStatus.VERIFIZIERT);
      context.repos.campaigns.addTarget(kampagne.id, company.id);
      if (!adresse) {
        context.repos.campaigns.setTargetStatus(kampagne.id, company.id, OutreachStatus.NEU, {
          reason: 'Keine verifizierte E-Mail-Adresse gefunden'
        });
        bericht.uebersprungen.push({ firma: company.name, grund: 'Keine verifizierte E-Mail-Adresse gefunden' });
        if (nurVerifiziert) continue;
      } else {
        bericht.mitVerifizierterAdresse++;
        context.repos.campaigns.setTargetStatus(kampagne.id, company.id, OutreachStatus.KONTAKT_GEFUNDEN);
      }
      if (!adresse) continue;

      const entwurf = await entwurfFuerUnternehmen(context, {
        campaignId: kampagne.id,
        companyId: company.id,
        dienstleistung: kampagne.service,
        empfaenger: adresse.address
      });
      if (!entwurf.ok) {
        bericht.uebersprungen.push({ firma: company.name, grund: entwurf.error ?? 'Entwurf fehlgeschlagen' });
        continue;
      }
      bericht.entwuerfe++;
      const daten_ = entwurf.data as { emailId: number; betreff: string; akquisegrund: string };
      bericht.zeilen.push({
        companyId: company.id,
        firma: company.name,
        email: adresse.address,
        status: adresse.verificationStatus,
        quelle: adresse.evidenceUrl,
        emailId: daten_.emailId,
        betreff: daten_.betreff,
        akquisegrund: daten_.akquisegrund
      });
    }

    return ok(
      `${bericht.recherchiert} Unternehmen recherchiert, für ${bericht.mitVerifizierterAdresse} eine verifizierte ` +
        `Kontaktadresse gefunden, ${bericht.entwuerfe} Entwürfe vorbereitet. Es wurde nichts versendet.`,
      bericht
    );
  }
};

const entwurfSchema = z.object({
  companyId: z.number().int(),
  campaignId: z.number().int().optional(),
  dienstleistung: z.string().optional().describe('Überschreibt die Leistung der Kampagne'),
  anweisung: z.string().optional().describe('Zusätzlicher Wunsch, z. B. "kurz halten"')
});

const composeOutreachEmail: ToolDefinition = {
  name: 'compose_outreach_email',
  agent: 'OutreachAgent',
  description:
    'Schreibt einen individuellen Akquise-Entwurf für ein einzelnes Unternehmen – auf Basis der belegten Fakten aus ' +
    'der Datenbank. Sendet nichts.',
  schema: entwurfSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof entwurfSchema>;
    const firma = context.repos.companies.byId(daten.companyId);
    if (!firma) return fail(`Unternehmen ${daten.companyId} existiert nicht.`);
    const kampagne = daten.campaignId ? context.repos.campaigns.byId(daten.campaignId) : null;
    const dienstleistung = daten.dienstleistung ?? kampagne?.service;
    if (!dienstleistung) return fail('Es ist nicht klar, welche Leistung angeboten werden soll.');
    const adresse = context.repos.addresses.best(firma.id, VerificationStatus.VERIFIZIERT);
    if (!adresse) {
      return fail(
        `Für ${firma.name} liegt keine verifizierte E-Mail-Adresse vor. Es wird kein Entwurf mit geratener Adresse erstellt.`
      );
    }
    return entwurfFuerUnternehmen(context, {
      campaignId: kampagne?.id ?? null,
      companyId: firma.id,
      dienstleistung,
      empfaenger: adresse.address,
      anweisung: daten.anweisung ?? null
    });
  }
};

/** Gemeinsamer Weg für Einzel- und Kampagnenentwurf. */
async function entwurfFuerUnternehmen(
  context: ToolContext,
  auftrag: {
    campaignId: number | null;
    companyId: number;
    dienstleistung: string;
    empfaenger: string;
    anweisung?: string | null;
  }
): Promise<ToolResult> {
  const firma = context.repos.companies.byId(auftrag.companyId);
  if (!firma) return fail(`Unternehmen ${auftrag.companyId} existiert nicht.`);
  const claims = context.repos.companies.claims(firma.id);
  const kontakt = context.repos.contacts.forCompany(firma.id)[0] ?? null;

  let entwurf;
  try {
    entwurf = await erstelleAkquiseMail(context.llm, {
      company: firma,
      contact: kontakt,
      claims,
      dienstleistung: auftrag.dienstleistung,
      akquisegrund: claims.find((c) => c.kind === ClaimKind.KI_EINSCHAETZUNG)?.statement ?? null,
      sender: context.config.sender,
      anweisung: auftrag.anweisung ?? null
    });
  } catch (error) {
    return fail(`Entwurf für ${firma.name} fehlgeschlagen: ${(error as Error).message}`);
  }

  if (entwurf.akquisegrund) {
    context.repos.companies.addClaim(firma.id, ClaimKind.KI_EINSCHAETZUNG, entwurf.akquisegrund, null);
  }

  const email = context.repos.emails.createDraft({
    campaignId: auftrag.campaignId,
    companyId: firma.id,
    contactId: kontakt?.id ?? null,
    to: [auftrag.empfaenger],
    subject: entwurf.subject,
    bodyText: entwurf.bodyText,
    fromAddress: context.config.mail.fromAddress || null
  });

  if (auftrag.campaignId) {
    context.repos.campaigns.setTargetStatus(auftrag.campaignId, firma.id, OutreachStatus.ENTWURF_ERSTELLT, {
      emailId: email.id,
      reason: entwurf.akquisegrund || null
    });
  }

  return ok(`Entwurf ${email.id} für ${firma.name} erstellt: „${entwurf.subject}“.`, {
    emailId: email.id,
    companyId: firma.id,
    firma: firma.name,
    empfaenger: auftrag.empfaenger,
    betreff: entwurf.subject,
    text: entwurf.bodyText,
    akquisegrund: entwurf.akquisegrund
  });
}

const listOutreachSchema = z.object({
  campaignId: z.number().int().optional(),
  status: z
    .enum([
      'NEU',
      'RECHERCHE_LAEUFT',
      'KONTAKT_GEFUNDEN',
      'ENTWURF_ERSTELLT',
      'WARTET_AUF_FREIGABE',
      'FREIGEGEBEN',
      'GESENDET',
      'FEHLER',
      'ANTWORT_ERHALTEN'
    ])
    .optional(),
  limit: z.number().int().min(1).max(200).optional()
});

const listOutreach: ToolDefinition = {
  name: 'list_outreach',
  agent: 'OutreachAgent',
  description:
    'Gibt die Versandzentrale zurück: Unternehmen, Ansprechpartner, Adresse, Quelle, Verifizierungsgrad, ' +
    'Akquisegrund, Mailstatus, letzter Kontakt und Freigabestatus.',
  schema: listOutreachSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof listOutreachSchema>;
    const zeilen = context.repos.campaigns.outreachRows({
      ...(daten.campaignId !== undefined ? { campaignId: daten.campaignId } : {}),
      ...(daten.status ? { status: daten.status as OutreachStatus } : {}),
      limit: daten.limit ?? 100
    });
    return ok(`${zeilen.length} Zeile(n) in der Versandzentrale.`, {
      anzahl: zeilen.length,
      zeilen: zeilen.map((zeile, index) => ({ nummer: index + 1, ...zeile }))
    });
  }
};

const campaignOverview: ToolDefinition = {
  name: 'list_campaigns',
  agent: 'OutreachAgent',
  description: 'Listet alle Kampagnen mit Fortschritt (Ziele, Entwürfe, Versendet).',
  schema: z.object({}),
  execute: async (_input, context) => {
    const kampagnen = context.repos.campaigns.list().map((kampagne) => {
      const zeilen = context.repos.campaigns.outreachRows({ campaignId: kampagne.id, limit: 500 });
      const zaehle = (status: OutreachStatus) => zeilen.filter((zeile) => zeile.status === status).length;
      return {
        campaignId: kampagne.id,
        name: kampagne.name,
        dienstleistung: kampagne.service,
        region: kampagne.region,
        ziel: kampagne.targetCount,
        unternehmen: zeilen.length,
        entwuerfe: zaehle(OutreachStatus.ENTWURF_ERSTELLT),
        wartetAufFreigabe: zaehle(OutreachStatus.WARTET_AUF_FREIGABE),
        gesendet: zaehle(OutreachStatus.GESENDET),
        fehler: zaehle(OutreachStatus.FEHLER)
      };
    });
    return ok(`${kampagnen.length} Kampagne(n).`, { anzahl: kampagnen.length, kampagnen });
  }
};

export const outreachTools: ToolDefinition[] = [
  createCampaign,
  prepareOutreach,
  composeOutreachEmail,
  listOutreach,
  campaignOverview
];
