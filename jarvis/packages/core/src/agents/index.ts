import { z } from 'zod';
import type { JarvisContext } from '../context.js';
import { defineTool, type AnyTool, type ToolRegistry } from '../tools/types.js';
import { err, ok } from '../util/result.js';
import { truncate } from '../util/text.js';
import { Agent, type AgentDefinition, type AgentRunResult } from './base.js';
import {
  jarvisCorePrompt,
  mailAgentPrompt,
  outreachAgentPrompt,
  researchAgentPrompt,
  systemAgentPrompt,
} from './prompts.js';

export * from './base.js';
export * from './prompts.js';
export * from './gespraech.js';

/**
 * Die Fachagenten.
 *
 * Jeder bekommt genau die Werkzeuge, die er fuer seine Aufgabe braucht.
 * Der MailAgent hat keinen Zugriff auf Dateien, der SystemAgent keinen auf
 * Mailentwuerfe -- ein Fehlgriff des Modells kann so keinen Schaden anrichten.
 */

export const COMPANY_RESEARCH_AGENT: AgentDefinition = {
  name: 'CompanyResearchAgent',
  role: 'Unternehmensrecherche',
  whenToUse: 'Firmen suchen, Websites auswerten, Kontaktdaten belegen, Adressen prüfen.',
  systemPrompt: researchAgentPrompt,
  maxSteps: 20,
  temperature: 0.2,
  tools: [
    'search_web',
    'open_website',
    'find_companies',
    'extract_company_information',
    'verify_email',
    'add_email_address',
    'find_company_in_database',
    'get_company_dossier',
  ],
};

export const MAIL_AGENT: AgentDefinition = {
  name: 'MailAgent',
  role: 'E-Mail',
  whenToUse: 'Mails verfassen, ändern, vorlesen, Anhänge, Entwürfe zur Freigabe stellen, Antworten prüfen.',
  systemPrompt: mailAgentPrompt,
  maxSteps: 14,
  temperature: 0.4,
  tools: [
    'create_email_draft',
    'read_email_draft',
    'update_email_draft',
    'list_email_drafts',
    'read_draft_aloud',
    'add_email_attachment',
    'request_send_approval',
    'mail_transport_status',
    'check_email_replies',
    'find_company_in_database',
    'get_company_dossier',
  ],
};

export const OUTREACH_AGENT: AgentDefinition = {
  name: 'OutreachAgent',
  role: 'Akquise',
  whenToUse: 'Ganze Akquise-Kampagnen: Firmen recherchieren, bewerten, individuelle Entwürfe vorbereiten.',
  systemPrompt: outreachAgentPrompt,
  maxSteps: 18,
  temperature: 0.3,
  tools: [
    'create_campaign',
    'list_campaigns',
    'research_campaign_targets',
    'draft_campaign_emails',
    'draft_single_outreach_email',
    'get_sending_center',
    'request_bulk_send_approval',
    'request_send_approval',
    'read_email_draft',
    'update_email_draft',
    'get_company_dossier',
    'manage_suppression_list',
  ],
};

export const SYSTEM_AGENT: AgentDefinition = {
  name: 'SystemAgent',
  role: 'Rechner und Dateien',
  whenToUse: 'Dateien suchen, lesen, anlegen, Programme und Webseiten öffnen, Zwischenablage, Termine.',
  systemPrompt: systemAgentPrompt,
  maxSteps: 10,
  temperature: 0.2,
  tools: [
    'list_known_applications',
    'search_files',
    'open_file',
    'read_file',
    'create_file',
    'delete_file',
    'open_application',
    'open_url_in_browser',
    'use_clipboard',
    'check_calendar',
  ],
};

export const FACH_AGENTEN: AgentDefinition[] = [
  COMPANY_RESEARCH_AGENT,
  MAIL_AGENT,
  OUTREACH_AGENT,
  SYSTEM_AGENT,
];

/** Werkzeuge, die JarvisCore selbst benutzt (ohne Umweg über einen Fachagenten). */
const CORE_EIGENE_TOOLS = [
  'get_system_status',
  'list_pending_approvals',
  'describe_approval',
  'ask_user_for_approval',
  'remember',
  'recall',
  'forget',
  'manage_tasks',
  'read_audit_log',
  'get_sending_center',
  'list_campaigns',
  'list_email_drafts',
  'read_email_draft',
  'read_draft_aloud',
  'find_company_in_database',
  'get_company_dossier',
  'check_calendar',
];

export const JARVIS_CORE_AGENT: AgentDefinition = {
  name: 'JarvisCore',
  role: 'JARVIS',
  whenToUse: 'Einstiegspunkt für jede Anfrage.',
  systemPrompt: jarvisCorePrompt,
  maxSteps: 16,
  temperature: 0.4,
  tools: ['delegate_to_agent', ...CORE_EIGENE_TOOLS],
};

/**
 * Erzeugt das Werkzeug, mit dem JarvisCore einen Fachagenten beauftragt.
 *
 * Der Unteragent bekommt einen frischen Kontext ohne Gesprächsverlauf --
 * er soll seine Aufgabe erledigen, nicht mitreden.
 */
export function createDelegateTool(agenten: Map<string, Agent>): AnyTool {
  const namen = [...agenten.keys()] as [string, ...string[]];
  const beschreibung = [...agenten.values()]
    .map((a) => `- ${a.definition.name} (${a.definition.role}): ${a.definition.whenToUse}`)
    .join('\n');

  return defineTool({
    name: 'delegate_to_agent',
    description: `Beauftragt einen Fachagenten mit einer abgeschlossenen Aufgabe.\n${beschreibung}\nDer Agent kennt das laufende Gespräch nicht — der Auftrag muss vollständig sein.`,
    category: 'system',
    readOnly: false,
    input: z.object({
      agent: z.enum(namen),
      auftrag: z
        .string()
        .min(10)
        .describe('Vollständige Aufgabenbeschreibung inklusive aller nötigen Angaben und Kennungen.'),
    }),
    handler: async (input, ctx) => {
      const agent = agenten.get(input.agent);
      if (!agent) {
        return err('NOT_FOUND', `Es gibt keinen Agenten namens "${input.agent}".`, {
          hint: `Verfügbar: ${[...agenten.keys()].join(', ')}`,
        });
      }

      ctx.bus.emit('status', { state: 'EXECUTING', detail: `${agent.definition.role} arbeitet` });
      ctx.audit.log({
        actor: 'JarvisCore',
        action: 'agent.beauftragt',
        summary: `${agent.definition.name} beauftragt: ${truncate(input.auftrag, 120)}`,
      });

      const result = await agent.run({ task: input.auftrag }, ctx);
      if (!result.ok) return result;

      return ok({
        agent: result.data.agent,
        ergebnis: result.data.text,
        schritte: result.data.steps.map((s) => ({ werkzeug: s.tool, erfolgreich: s.ok, ergebnis: s.summary })),
        abgebrochen: result.data.abgebrochen,
        ...(result.data.hinweis ? { hinweis: result.data.hinweis } : {}),
      });
    },
    summarize: (input, r) =>
      r.ok ? `${input.agent} hat den Auftrag bearbeitet` : `${input.agent}: ${r.error.message}`,
  });
}

/**
 * Baut alle Agenten und traegt das Delegationswerkzeug in die Registry ein.
 * Muss einmal beim Start aufgerufen werden.
 */
export function createAgents(registry: ToolRegistry): { core: Agent; fachagenten: Map<string, Agent> } {
  const fachagenten = new Map<string, Agent>();
  for (const def of FACH_AGENTEN) fachagenten.set(def.name, new Agent(def));

  if (!registry.has('delegate_to_agent')) {
    registry.register(createDelegateTool(fachagenten));
  }

  return { core: new Agent(JARVIS_CORE_AGENT), fachagenten };
}

export type { AgentRunResult, JarvisContext };
