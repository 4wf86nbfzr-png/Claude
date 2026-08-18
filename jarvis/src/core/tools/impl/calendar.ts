import { z } from 'zod';
import { createCalendarService } from '../../services/calendar';
import { fail, ok, type ToolDefinition } from '../types';

const kalenderSchema = z.object({
  vonISO: z.string().optional().describe('Beginn des Zeitraums (ISO-Datum), Standard: jetzt'),
  bisISO: z.string().optional().describe('Ende des Zeitraums (ISO-Datum), Standard: in 24 Stunden'),
  maxAnzahl: z.number().int().min(1).max(50).optional()
});

const checkCalendar: ToolDefinition = {
  name: 'check_calendar',
  agent: 'CalendarAgent',
  description:
    'Liest Termine aus dem verbundenen Kalender. Ist kein Kalender verbunden, wird das gesagt – es werden keine ' +
    'Termine erfunden.',
  schema: kalenderSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof kalenderSchema>;
    const kalender = createCalendarService(context.credentials);
    if (!kalender.configured()) return fail(kalender.missingHint());
    const von = daten.vonISO ? new Date(daten.vonISO) : new Date();
    const bis = daten.bisISO ? new Date(daten.bisISO) : new Date(von.getTime() + 86_400_000);
    if (Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime())) return fail('Der Zeitraum ist nicht lesbar.');
    try {
      const termine = await kalender.termine(von, bis, daten.maxAnzahl ?? 20);
      return ok(
        termine.length === 0
          ? 'In diesem Zeitraum stehen keine Termine im Kalender.'
          : `${termine.length} Termin(e) im Zeitraum.`,
        { anzahl: termine.length, termine }
      );
    } catch (error) {
      return fail(`Kalender nicht abrufbar: ${(error as Error).message}`);
    }
  }
};

const aufgabeSchema = z.object({
  titel: z.string().min(2),
  beschreibung: z.string().optional(),
  faelligISO: z.string().optional()
});

const createTask: ToolDefinition = {
  name: 'create_task',
  agent: 'CalendarAgent',
  description: 'Legt eine Aufgabe in der lokalen Aufgabenliste an.',
  schema: aufgabeSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof aufgabeSchema>;
    const aufgabe = context.repos.tasks.create(daten.titel, daten.beschreibung ?? null, daten.faelligISO ?? null);
    return ok(`Aufgabe „${aufgabe.title}“ angelegt (Nr. ${aufgabe.id}).`, { aufgabe });
  }
};

const listTasks: ToolDefinition = {
  name: 'list_tasks',
  agent: 'CalendarAgent',
  description: 'Zeigt die Aufgabenliste – Grundlage für "Was steht heute noch an?".',
  schema: z.object({ status: z.enum(['OFFEN', 'LAEUFT', 'ERLEDIGT', 'ABGEBROCHEN']).optional() }),
  execute: async (input, context) => {
    const { status } = input as { status?: 'OFFEN' | 'LAEUFT' | 'ERLEDIGT' | 'ABGEBROCHEN' };
    const aufgaben = context.repos.tasks.list(status);
    return ok(`${aufgaben.length} Aufgabe(n).`, { anzahl: aufgaben.length, aufgaben });
  }
};

const completeTask: ToolDefinition = {
  name: 'complete_task',
  agent: 'CalendarAgent',
  description: 'Setzt eine Aufgabe auf erledigt.',
  schema: z.object({ taskId: z.number().int() }),
  execute: async (input, context) => {
    const { taskId } = input as { taskId: number };
    const aufgabe = context.repos.tasks.setStatus(taskId, 'ERLEDIGT');
    if (!aufgabe) return fail(`Aufgabe ${taskId} existiert nicht.`);
    return ok(`Aufgabe „${aufgabe.title}“ ist erledigt.`, { aufgabe });
  }
};

const auditSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  heute: z.boolean().optional().describe('Nur die Einträge von heute')
});

const readAuditLog: ToolDefinition = {
  name: 'read_audit_log',
  agent: 'AuditLogService',
  description: 'Gibt das Protokoll zurück – was JARVIS wann getan hat.',
  schema: auditSchema,
  execute: async (input, context) => {
    const { limit, heute } = input as z.infer<typeof auditSchema>;
    const eintraege = heute ? context.audit.forDay(new Date()) : context.audit.recent(limit ?? 50);
    return ok(`${eintraege.length} Protokolleintrag/-einträge.`, {
      anzahl: eintraege.length,
      eintraege: eintraege.map((eintrag) => ({
        zeit: new Date(eintrag.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        aktion: eintrag.action,
        ziel: eintrag.target,
        status: eintrag.status
      }))
    });
  }
};

export const calendarTools: ToolDefinition[] = [checkCalendar, createTask, listTasks, completeTask, readAuditLog];
