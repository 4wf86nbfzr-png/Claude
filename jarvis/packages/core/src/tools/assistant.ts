import { z } from 'zod';
import { defineTool, type AnyTool } from './types.js';
import { err, ok } from '../util/result.js';
import { APPROVAL_STATUS } from '../db/schema.js';
import { AuditLogService } from '../services/audit.js';
import { MEMORY_KINDS, type MemoryKind } from '../services/memory.js';

/** Freigaben, Gedaechtnis, Aufgaben und Protokoll -- die Selbstverwaltung. */

export const listApprovalsTool = defineTool({
  name: 'list_pending_approvals',
  description:
    'Zeigt alle offenen Freigabeanfragen mit fortlaufender Nummer. Die Nummer ist die Bezugsgröße für "Nummer 4 freigeben".',
  category: 'freigabe',
  readOnly: true,
  input: z.object({}),
  handler: async (_input, ctx) => {
    const rows = ctx.approvals.pending();
    return ok({
      anzahl: rows.length,
      freigaben: rows.map((a, i) => ({
        nummer: i + 1,
        freigabeId: a.id,
        art: a.action_type,
        titel: a.title,
        zusammenfassung: a.summary,
        angefragtVon: a.requested_by,
        angefragtAm: a.requested_at,
        laeuftAbAm: a.expires_at,
        details: ctx.approvals.details(a),
      })),
    });
  },
  summarize: (_i, r) => (r.ok ? `${(r.data as { anzahl: number }).anzahl} offene Freigaben` : r.error.message),
});

export const describeApprovalTool = defineTool({
  name: 'describe_approval',
  description:
    'Gibt eine Freigabeanfrage vollständig wieder (Empfänger, Betreff, Mailtext) — zum Vorlesen vor der Entscheidung.',
  category: 'freigabe',
  readOnly: true,
  input: z.object({
    freigabeId: z.string().optional(),
    nummer: z.number().int().min(1).optional().describe('Position in der Liste der offenen Freigaben.'),
  }),
  handler: async (input, ctx) => {
    const row = input.freigabeId
      ? ctx.approvals.get(input.freigabeId)
      : input.nummer
        ? ctx.approvals.resolveByOrdinal(input.nummer)
        : undefined;
    if (!row) return err('NOT_FOUND', 'Diese Freigabeanfrage gibt es nicht.');
    return ok({
      freigabeId: row.id,
      titel: row.title,
      frage: row.summary,
      status: APPROVAL_STATUS[row.status],
      details: ctx.approvals.details(row),
    });
  },
});

/**
 * Bewusst *keine* Freigabe durch das Modell.
 *
 * Dieses Tool leitet die Entscheidung an den Benutzer weiter -- es entscheidet
 * nicht selbst. Freigeben kann nur ein Mensch, ueber die Oberflaeche oder
 * einen ausdruecklichen Sprachbefehl, der im Hauptprozess ausgewertet wird.
 */
export const askForApprovalTool = defineTool({
  name: 'ask_user_for_approval',
  description:
    'Fordert den Benutzer auf, eine offene Freigabe zu entscheiden, und liest ihm die Eckdaten vor. Erteilt selbst keine Freigabe.',
  category: 'freigabe',
  readOnly: true,
  input: z.object({ freigabeId: z.string(), vorlesen: z.boolean().optional() }),
  handler: async (input, ctx) => {
    const row = ctx.approvals.get(input.freigabeId);
    if (!row) return err('NOT_FOUND', 'Diese Freigabeanfrage gibt es nicht.');
    if (row.status !== 'offen') {
      return err('APPROVAL_STALE', `Die Anfrage ist bereits entschieden (${APPROVAL_STATUS[row.status]}).`);
    }
    const details = ctx.approvals.details(row);
    const gesprochen = [row.summary, ...details.map((d) => `${d.label}: ${d.value}`)].join('\n');
    if (input.vorlesen !== false) ctx.bus.emit('speak', { text: gesprochen, interrupt: true });
    ctx.bus.emit('status', { state: 'WAITING FOR APPROVAL', detail: row.title });
    return ok({
      freigabeId: row.id,
      frage: row.summary,
      hinweis: 'Der Benutzer entscheidet. Warte auf seine ausdrückliche Antwort, bevor du weitermachst.',
    });
  },
});

export const rememberTool = defineTool({
  name: 'remember',
  description:
    'Merkt sich eine dauerhafte Angabe (Vorliebe, feste Firmenangabe, Person, Projekt). Nur benutzen, wenn der Benutzer das ausdrücklich möchte oder es für die Arbeit offensichtlich nötig ist.',
  category: 'gedaechtnis',
  readOnly: false,
  input: z.object({
    art: z.enum(Object.keys(MEMORY_KINDS) as [MemoryKind, ...MemoryKind[]]),
    schluessel: z.string().min(1).describe('Kurzer Name, z. B. "Signatur" oder "Bevorzugte Mail-Länge".'),
    wert: z.string().min(1),
    wichtigkeit: z.number().int().min(1).max(5).optional(),
  }),
  handler: async (input, ctx) => {
    const row = ctx.memory.remember({
      kind: input.art,
      key: input.schluessel,
      value: input.wert,
      ...(input.wichtigkeit !== undefined ? { importance: input.wichtigkeit } : {}),
      source: ctx.agent,
    });
    ctx.audit.log({
      actor: ctx.actor,
      action: 'gedaechtnis.gespeichert',
      summary: `Gemerkt (${MEMORY_KINDS[input.art]}): ${input.schluessel}`,
    });
    ctx.bus.emit('invalidate', { scope: 'memory' });
    return ok({ gespeichert: { art: row.kind, schluessel: row.key, wert: row.value } });
  },
});

export const recallTool = defineTool({
  name: 'recall',
  description: 'Gibt aus, was JARVIS sich gemerkt hat.',
  category: 'gedaechtnis',
  readOnly: true,
  input: z.object({ art: z.enum(Object.keys(MEMORY_KINDS) as [MemoryKind, ...MemoryKind[]]).optional() }),
  handler: async (input, ctx) => {
    const rows = ctx.memory.list(input.art);
    return ok({
      anzahl: rows.length,
      eintraege: rows.map((m) => ({ id: m.id, art: m.kind, schluessel: m.key, wert: m.value })),
    });
  },
});

export const forgetTool = defineTool({
  name: 'forget',
  description: 'Löscht einen gemerkten Eintrag.',
  category: 'gedaechtnis',
  readOnly: false,
  input: z.object({ id: z.string() }),
  handler: async (input, ctx) => {
    const ok_ = ctx.memory.forget(input.id);
    if (!ok_) return err('NOT_FOUND', `Es gibt keinen Eintrag mit der Kennung ${input.id}.`);
    ctx.audit.log({ actor: ctx.actor, action: 'gedaechtnis.geloescht', summary: `Gemerkten Eintrag gelöscht (${input.id})` });
    ctx.bus.emit('invalidate', { scope: 'memory' });
    return ok({ geloescht: input.id });
  },
});

export const taskTool = defineTool({
  name: 'manage_tasks',
  description: 'Legt Aufgaben an, listet sie oder hakt sie ab. Für "Was steht heute noch an?".',
  category: 'gedaechtnis',
  readOnly: false,
  input: z.object({
    aktion: z.enum(['anlegen', 'anzeigen', 'erledigen', 'loeschen']),
    titel: z.string().optional(),
    faelligAm: z.string().optional().describe('ISO-Datum, z. B. 2026-08-20T09:00:00Z'),
    notiz: z.string().optional(),
    aufgabeId: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    switch (input.aktion) {
      case 'anlegen': {
        if (!input.titel) return err('INVALID_INPUT', 'Der Titel der Aufgabe fehlt.');
        const row = ctx.repos.tasks.create({
          title: input.titel,
          dueAt: input.faelligAm ?? null,
          notes: input.notiz ?? null,
        });
        ctx.bus.emit('invalidate', { scope: 'tasks' });
        return ok({ aufgabeId: row.id, titel: row.title, faelligAm: row.due_at });
      }
      case 'anzeigen': {
        const rows = ctx.repos.tasks.list({ status: 'offen' });
        return ok({
          anzahl: rows.length,
          aufgaben: rows.map((t) => ({ aufgabeId: t.id, titel: t.title, faelligAm: t.due_at, notiz: t.notes })),
        });
      }
      case 'erledigen': {
        if (!input.aufgabeId) return err('INVALID_INPUT', 'Die Aufgabenkennung fehlt.');
        ctx.repos.tasks.setStatus(input.aufgabeId, 'erledigt');
        ctx.bus.emit('invalidate', { scope: 'tasks' });
        return ok({ erledigt: input.aufgabeId });
      }
      default: {
        if (!input.aufgabeId) return err('INVALID_INPUT', 'Die Aufgabenkennung fehlt.');
        const geloescht = ctx.repos.tasks.delete(input.aufgabeId);
        ctx.bus.emit('invalidate', { scope: 'tasks' });
        return geloescht ? ok({ geloescht: input.aufgabeId }) : err('NOT_FOUND', 'Aufgabe nicht gefunden.');
      }
    }
  },
});

export const auditTool = defineTool({
  name: 'read_audit_log',
  description: 'Liest das Protokoll: was hat JARVIS wann getan. Für "Was hast du gerade gemacht?".',
  category: 'gedaechtnis',
  readOnly: true,
  input: z.object({
    anzahl: z.number().int().min(1).max(200).optional(),
    seit: z.string().optional().describe('ISO-Zeitstempel'),
    objektTyp: z.string().optional(),
    objektId: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const rows = ctx.audit.list({
      limit: input.anzahl ?? 30,
      ...(input.seit ? { since: input.seit } : {}),
      ...(input.objektTyp ? { entityType: input.objektTyp } : {}),
      ...(input.objektId ? { entityId: input.objektId } : {}),
    });
    return ok({
      anzahl: rows.length,
      eintraege: rows.map((r) => ({
        zeile: AuditLogService.toSpokenLine(r, ctx.env.JARVIS_LOCALE),
        zeit: r.ts,
        wer: r.actor,
        was: r.action,
        ergebnis: r.outcome,
      })),
    });
  },
});

export const statusTool = defineTool({
  name: 'get_system_status',
  description:
    'Zeigt den Einrichtungsstand: Sprachmodell, Suchdienst, Versandweg, Posteingang, Sprachein- und -ausgabe, Kalender sowie die Versandlimits.',
  category: 'system',
  readOnly: true,
  input: z.object({}),
  handler: async (_input, ctx) => {
    const voice = ctx.voice.status();
    return ok({
      sprachmodell: {
        anbieter: ctx.llm.id,
        modell: ctx.llm.defaultModel,
        bereit: ctx.llm.isConfigured(),
        hinweis: ctx.llm.missingConfigHint(),
      },
      suche: { anbieter: ctx.research.providerLabel, hinweis: ctx.research.providerHint() },
      versand: ctx.mail.transportStatus(),
      posteingang: ctx.mailReader
        ? { anbieter: ctx.mailReader.id, bereit: ctx.mailReader.isConfigured(), hinweis: ctx.mailReader.missingConfigHint() }
        : { anbieter: 'keiner', bereit: false, hinweis: 'Kein IMAP eingerichtet.' },
      spracheingabe: voice.stt,
      sprachausgabe: voice.tts,
      kalender: { bereit: ctx.calendar.isConfigured(), anbieter: ctx.calendar.label },
      versandlimits: ctx.compliance.currentLimits,
      freigegebeneVerzeichnisse: ctx.system.roots,
      offeneFreigaben: ctx.approvals.pending().length,
    });
  },
});

export const assistantTools: AnyTool[] = [
  listApprovalsTool,
  describeApprovalTool,
  askForApprovalTool,
  rememberTool,
  recallTool,
  forgetTool,
  taskTool,
  auditTool,
  statusTool,
];
