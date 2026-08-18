import { z } from 'zod/v4';
import { ok } from '../../shared/types.js';
import { defineTool } from './Tool.js';
import { formatDe } from '../util/id.js';

export const checkCalendarTool = defineTool({
  name: 'check_calendar',
  agent: 'CalendarAgent',
  description:
    'Zeigt die anstehenden Termine aus den hinterlegten ICS-Kalendern sowie die offenen Aufgaben. Beantwortet „Was steht heute noch an?".',
  schema: z.object({
    days: z.number().int().min(1).max(60).default(7),
  }),
  summarize: (input) => `Termine der nächsten ${input.days} Tage`,
  async run(input, context) {
    const events = await context.agents.calendar.upcoming(input.days);
    const tasks = context.agents.calendar.openTasks();
    if (!events.ok) {
      // Tasks are local and always available; report them even without calendar.
      return ok({
        kalenderFehler: events.error.message,
        hinweis: events.error.hint,
        termine: [],
        offeneAufgaben: tasks.map((task) => ({ titel: task.title, faellig: formatDe(task.dueAt) })),
      });
    }
    return ok({
      termine: events.value.map((event) => ({
        titel: event.summary,
        beginn: event.start,
        ende: event.end,
        ort: event.location,
        ganztaegig: event.allDay,
        quelle: event.source,
      })),
      offeneAufgaben: tasks.map((task) => ({ titel: task.title, faellig: formatDe(task.dueAt) })),
    });
  },
});

export const createTaskTool = defineTool({
  name: 'create_task',
  agent: 'CalendarAgent',
  description: 'Legt eine Aufgabe an, optional mit Fälligkeitsdatum und Bezug zu einem Unternehmen.',
  schema: z.object({
    title: z.string().min(3),
    detail: z.string().optional(),
    dueAt: z.string().optional().describe('ISO-Datum, z. B. 2026-09-01T09:00:00'),
    companyId: z.number().int().optional(),
  }),
  summarize: (input) => `Aufgabe: ${input.title}`,
  async run(input, context) {
    const task = context.repos.tasks.create({
      title: input.title,
      detail: input.detail ?? null,
      dueAt: input.dueAt ?? null,
      companyId: input.companyId ?? null,
    });
    context.services.audit.log({
      actor: 'jarvis',
      agent: 'CalendarAgent',
      action: 'aufgabe.angelegt',
      subject: `task:${task.id}`,
      outcome: 'ok',
      detail: task.title,
    });
    return ok({ aufgabeId: task.id, titel: task.title, faellig: task.dueAt });
  },
});

export const rememberTool = defineTool({
  name: 'remember',
  agent: 'MemoryService',
  description:
    'Merkt sich dauerhaft eine Präferenz oder einen Fakt über den Benutzer bzw. sein Unternehmen. Nur verwenden, wenn der Benutzer erkennbar möchte, dass etwas dauerhaft gilt. Der Benutzer kann alles Gespeicherte einsehen und löschen.',
  schema: z.object({
    kind: z.enum(['preference', 'fact', 'note']).default('preference'),
    key: z.string().min(2).describe('Kurzer Schlüssel, z. B. "anrede" oder "signatur"'),
    value: z.string().min(2),
  }),
  summarize: (input) => `Merken: ${input.key}`,
  async run(input, context) {
    const entry = context.services.memory.remember(input.kind, input.key, input.value);
    context.services.audit.log({
      actor: 'jarvis',
      agent: 'MemoryService',
      action: 'gedaechtnis.gespeichert',
      subject: `${entry.kind}:${entry.key}`,
      outcome: 'ok',
    });
    return ok({ gespeichert: entry.key, art: entry.kind });
  },
});

export const recallTool = defineTool({
  name: 'list_memory',
  agent: 'MemoryService',
  description: 'Zeigt, was dauerhaft gespeichert ist.',
  schema: z.object({
    kind: z.enum(['preference', 'fact', 'note', 'alle']).default('alle'),
  }),
  summarize: () => 'Gedächtnis anzeigen',
  async run(input, context) {
    const entries = context.services.memory.list(input.kind === 'alle' ? undefined : input.kind);
    return ok(
      entries.map((entry) => ({
        id: entry.id,
        art: entry.kind,
        schluessel: entry.key,
        wert: entry.value,
        gespeichertAm: formatDe(entry.createdAt),
      })),
    );
  },
});

export const auditTool = defineTool({
  name: 'read_audit_log',
  agent: 'AuditLogService',
  description:
    'Zeigt das Protokoll der letzten Aktionen — was wann von wem ausgeführt wurde, inklusive Freigaben und Fehlern.',
  schema: z.object({
    limit: z.number().int().min(1).max(200).default(30),
  }),
  summarize: (input) => `Protokoll (${input.limit} Einträge)`,
  async run(input, context) {
    return ok(
      context.services.audit.list(input.limit).map((entry) => ({
        zeit: formatDe(entry.at),
        akteur: entry.actor,
        agent: entry.agent,
        aktion: entry.action,
        objekt: entry.subject,
        ergebnis: entry.outcome,
        detail: entry.detail,
      })),
    );
  },
});

export const statusTool = defineTool({
  name: 'system_status',
  agent: 'JarvisCore',
  description:
    'Fasst zusammen, was eingerichtet ist und was fehlt: Modellanbieter, Postausgang, Suchanbieter, Sprachausgabe, Anzahl Unternehmen, offene Freigaben.',
  schema: z.object({}),
  summarize: () => 'Systemstatus',
  async run(_input, context) {
    const settings = context.services.settings.get();
    const credentials = context.services.credentials.status();
    const present = new Set(credentials.filter((entry) => entry.present).map((entry) => entry.key));

    return ok({
      modell: `${settings.llm.provider} / ${settings.llm.model}`,
      modellSchluesselVorhanden:
        settings.llm.provider === 'ollama' ||
        present.has(settings.llm.provider === 'anthropic' ? 'anthropic.apiKey' : 'openai.apiKey'),
      postausgang: settings.mail.transport,
      absender: settings.mail.identity.email || null,
      suchanbieter: settings.research.searchProvider,
      spracheingabe: settings.voice.sttProvider,
      sprachausgabe: settings.voice.ttsProvider,
      unternehmenGespeichert: context.repos.companies.list(1000).length,
      entwuerfeOffen: context.repos.emails.list({ status: 'entwurf', limit: 500 }).length,
      offeneFreigaben: context.services.approvals.listOpen().length,
      nurVerifizierteAdressen: settings.compliance.requireVerifiedAddress,
      tageslimit: settings.compliance.dailySendLimit,
      einrichtungAbgeschlossen: settings.setupCompleted,
    });
  },
});
