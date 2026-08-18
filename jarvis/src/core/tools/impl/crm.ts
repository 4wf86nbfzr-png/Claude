import { z } from 'zod';
import { ClaimKind, VerificationStatus } from '../../../shared/status';
import { fail, ok, type ToolDefinition } from '../types';

const saveSchema = z.object({
  name: z.string().min(2).describe('Firmenname'),
  website: z.string().optional(),
  ort: z.string().optional(),
  branche: z.string().optional(),
  beschreibung: z.string().optional(),
  notiz: z.string().optional()
});

const saveCompany: ToolDefinition = {
  name: 'save_company',
  agent: 'CompanyResearchAgent',
  description:
    'Legt ein Unternehmen in der lokalen Datenbank an oder ergänzt ein vorhandenes. Dubletten werden über Domain ' +
    'sowie Name und Ort erkannt und zusammengeführt.',
  schema: saveSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof saveSchema>;
    const { company, created } = context.repos.companies.upsert({
      name: daten.name,
      website: daten.website ?? null,
      city: daten.ort ?? null,
      industry: daten.branche ?? null,
      description: daten.beschreibung ?? null,
      notes: daten.notiz ?? null
    });
    return ok(
      created ? `${company.name} neu angelegt (Nr. ${company.id}).` : `${company.name} war bereits bekannt (Nr. ${company.id}).`,
      { companyId: company.id, neu: created, name: company.name }
    );
  }
};

const listSchema = z.object({
  suche: z.string().optional().describe('Filter über Name, Ort oder Branche'),
  limit: z.number().int().min(1).max(200).optional()
});

const listCompanies: ToolDefinition = {
  name: 'list_companies',
  agent: 'CompanyResearchAgent',
  description: 'Listet gespeicherte Unternehmen mit bester bekannter Kontaktadresse und Verifizierungsgrad.',
  schema: listSchema,
  execute: async (input, context) => {
    const { suche, limit } = input as z.infer<typeof listSchema>;
    const unternehmen = suche
      ? context.repos.companies.search(suche, limit ?? 50)
      : context.repos.companies.list(limit ?? 50);
    return ok(`${unternehmen.length} Unternehmen.`, {
      anzahl: unternehmen.length,
      unternehmen: unternehmen.map((firma) => {
        const adresse = context.repos.addresses.best(firma.id, VerificationStatus.WAHRSCHEINLICH);
        return {
          companyId: firma.id,
          name: firma.name,
          ort: firma.city,
          branche: firma.industry,
          website: firma.website,
          email: adresse?.address ?? null,
          status: adresse?.verificationStatus ?? 'NICHT_VERIFIZIERT'
        };
      })
    });
  }
};

const getSchema = z.object({ companyId: z.number().int() });

const getCompany: ToolDefinition = {
  name: 'get_company',
  agent: 'CompanyResearchAgent',
  description:
    'Gibt alles zu einem Unternehmen zurück: Stammdaten, Ansprechpartner, Adressen mit Quellen, belegte Fakten, ' +
    'ausdrücklich gekennzeichnete Einschätzungen und die bisherige Kontakthistorie.',
  schema: getSchema,
  execute: async (input, context) => {
    const { companyId } = input as z.infer<typeof getSchema>;
    const firma = context.repos.companies.byId(companyId);
    if (!firma) return fail(`Unternehmen ${companyId} existiert nicht.`);
    const claims = context.repos.companies.claims(companyId);
    return ok(`${firma.name} (Nr. ${firma.id}).`, {
      unternehmen: firma,
      ansprechpartner: context.repos.contacts.forCompany(companyId),
      adressen: context.repos.addresses.forCompany(companyId).map((adresse) => ({
        address: adresse.address,
        status: adresse.verificationStatus,
        quelle: adresse.evidenceUrl,
        beleg: adresse.evidenceSnippet
      })),
      fakten: claims.filter((c) => c.kind === ClaimKind.FAKT).map((c) => ({ aussage: c.statement, quelle: c.sourceUrl })),
      einschaetzungen: claims.filter((c) => c.kind === ClaimKind.KI_EINSCHAETZUNG).map((c) => c.statement),
      historie: context.repos.interactions.forCompany(companyId)
    });
  }
};

const claimSchema = z.object({
  companyId: z.number().int(),
  aussage: z.string().min(5).describe('Die Aussage selbst'),
  art: z.enum(['FAKT', 'KI_EINSCHAETZUNG']).describe('FAKT nur mit Quelle, sonst KI_EINSCHAETZUNG'),
  quelle: z.string().url().optional().describe('Adresse der Quelle – bei FAKT verpflichtend')
});

const addCompanyClaim: ToolDefinition = {
  name: 'add_company_note',
  agent: 'CompanyResearchAgent',
  description:
    'Hält eine Aussage über ein Unternehmen fest. FAKT verlangt eine Quelle; ohne Quelle wird nur eine als solche ' +
    'gekennzeichnete Einschätzung gespeichert (§15).',
  schema: claimSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof claimSchema>;
    if (!context.repos.companies.byId(daten.companyId)) return fail(`Unternehmen ${daten.companyId} existiert nicht.`);
    if (daten.art === 'FAKT' && !daten.quelle) {
      return fail('Ein Fakt braucht eine Quelle. Ohne Quelle bitte als KI_EINSCHAETZUNG ablegen.');
    }
    const quelle = daten.quelle
      ? context.repos.sources.latestForUrl(daten.quelle) ?? context.repos.sources.record({ url: daten.quelle, kind: 'sonstige' })
      : null;
    context.repos.companies.addClaim(daten.companyId, daten.art as ClaimKind, daten.aussage, quelle?.id ?? null);
    return ok(`Notiz zu Unternehmen ${daten.companyId} gespeichert (${daten.art}).`);
  }
};

const previousSchema = z.object({ companyId: z.number().int() });

const checkPreviousContact: ToolDefinition = {
  name: 'check_previous_contact',
  agent: 'OutreachAgent',
  description:
    'Prüft, ob ein Unternehmen bereits angeschrieben wurde, und gibt Datum und Betreff zurück. Vor jedem Erstkontakt aufrufen.',
  schema: previousSchema,
  execute: async (input, context) => {
    const { companyId } = input as z.infer<typeof previousSchema>;
    const firma = context.repos.companies.byId(companyId);
    if (!firma) return fail(`Unternehmen ${companyId} existiert nicht.`);
    const letzte = context.repos.emails.lastSentToCompany(companyId);
    const historie = context.repos.interactions.forCompany(companyId, 10);
    if (!letzte) {
      return ok(`${firma.name} wurde noch nicht angeschrieben.`, { bereitsKontaktiert: false, historie });
    }
    const datum = letzte.sentAt ? new Date(letzte.sentAt).toLocaleDateString('de-DE') : 'unbekannt';
    return ok(
      `${firma.name} wurde am ${datum} bereits angeschrieben (Betreff: „${letzte.subject}“). ` +
        'Ohne ausdrücklichen Wunsch keinen zweiten Erstkontakt vorbereiten.',
      {
        bereitsKontaktiert: true,
        datum: letzte.sentAt,
        betreff: letzte.subject,
        empfaenger: letzte.toAddresses,
        historie
      }
    );
  }
};

const suppressionSchema = z.object({
  wert: z.string().describe('E-Mail-Adresse oder Domain'),
  art: z.enum(['adresse', 'domain']).describe('Wird eine einzelne Adresse oder eine ganze Domain gesperrt?'),
  grund: z.string().optional().describe('Warum gesperrt – z. B. "Widerspruch per Mail am 12.08."')
});

const addToSuppression: ToolDefinition = {
  name: 'add_to_do_not_contact',
  agent: 'OutreachAgent',
  description:
    'Setzt eine Adresse oder Domain auf die Sperrliste. Gesperrte Empfänger werden nie wieder angeschrieben – ' +
    'auch nicht auf ausdrückliche Anweisung.',
  schema: suppressionSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof suppressionSchema>;
    const eintrag = context.repos.suppression.add(daten.wert, daten.art, daten.grund);
    context.audit.log('Sperrliste ergänzt', {
      actor: 'BENUTZER',
      agent: 'OutreachAgent',
      target: eintrag.value,
      status: 'OK',
      detail: { art: eintrag.patternType, grund: eintrag.reason }
    });
    return ok(`${eintrag.value} steht jetzt auf der Sperrliste.`, { eintrag });
  }
};

const listSuppression: ToolDefinition = {
  name: 'list_do_not_contact',
  agent: 'OutreachAgent',
  description: 'Zeigt die Sperrliste.',
  schema: z.object({}),
  execute: async (_input, context) => {
    const liste = context.repos.suppression.list();
    return ok(`${liste.length} Eintrag/Einträge auf der Sperrliste.`, { anzahl: liste.length, eintraege: liste });
  }
};

const memorySchema = z.object({
  bereich: z.enum(['praeferenz', 'firmenwissen', 'notiz']).describe('Art des Merkpostens'),
  schluessel: z.string().min(2).describe('Kurzer Schlüssel, z. B. "bevorzugte Anrede"'),
  wert: z.string().min(1).describe('Der zu merkende Inhalt')
});

const remember: ToolDefinition = {
  name: 'remember',
  agent: 'MemoryService',
  description:
    'Merkt sich eine einzelne, benannte Information dauerhaft. Nur benutzen, wenn der Benutzer erkennbar möchte, ' +
    'dass etwas gemerkt wird – Gesprächsverläufe werden nicht automatisch gespeichert.',
  schema: memorySchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof memorySchema>;
    const eintrag = context.repos.memory.remember(daten.bereich, daten.schluessel, daten.wert);
    return ok(`Gemerkt: ${eintrag.key}.`, { eintrag });
  }
};

const recall: ToolDefinition = {
  name: 'recall',
  agent: 'MemoryService',
  description: 'Gibt alle gemerkten Informationen zurück, optional auf einen Bereich beschränkt.',
  schema: z.object({ bereich: z.enum(['praeferenz', 'firmenwissen', 'notiz', 'gespraech']).optional() }),
  execute: async (input, context) => {
    const { bereich } = input as { bereich?: 'praeferenz' | 'firmenwissen' | 'notiz' | 'gespraech' };
    const eintraege = context.repos.memory.list(bereich);
    return ok(`${eintraege.length} Merkposten.`, { anzahl: eintraege.length, eintraege });
  }
};

export const crmTools: ToolDefinition[] = [
  saveCompany,
  listCompanies,
  getCompany,
  addCompanyClaim,
  checkPreviousContact,
  addToSuppression,
  listSuppression,
  remember,
  recall
];
