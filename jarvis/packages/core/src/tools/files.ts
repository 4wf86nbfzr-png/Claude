import { z } from 'zod';
import { defineTool, type AnyTool } from './types.js';
import { err, ok } from '../util/result.js';
import { truncate } from '../util/text.js';

/**
 * Datei- und Systemwerkzeuge.
 *
 * Schreibende Aktionen legen eine Freigabeanfrage an, statt sofort zu handeln.
 * Der zugehoerige Executor wird in `registerSystemExecutors` eingehaengt --
 * so gibt es fuer jede kritische Aktion genau einen Ausfuehrungsweg.
 */

export const searchFilesTool = defineTool({
  name: 'search_files',
  description: 'Sucht Dateien nach Namensbestandteil in den freigegebenen Verzeichnissen.',
  category: 'datei',
  readOnly: true,
  input: z.object({
    suchbegriff: z.string().min(1),
    ordner: z.string().optional(),
    anzahl: z.number().int().min(1).max(200).optional(),
  }),
  handler: async (input, ctx) => {
    const r = await ctx.system.searchFiles({
      query: input.suchbegriff,
      ...(input.ordner ? { root: input.ordner } : {}),
      ...(input.anzahl !== undefined ? { limit: input.anzahl } : {}),
    });
    if (!r.ok) return r;
    return ok({
      anzahl: r.data.length,
      dateien: r.data.map((f) => ({ pfad: f.path, name: f.name, groesseBytes: f.sizeBytes, geaendertAm: f.modifiedAt })),
      durchsuchteVerzeichnisse: ctx.system.roots,
    });
  },
  summarize: (i, r) => (r.ok ? `${(r.data as { anzahl: number }).anzahl} Dateien zu "${i.suchbegriff}"` : r.error.message),
});

export const openFileTool = defineTool({
  name: 'open_file',
  description: 'Öffnet eine Datei oder einen Ordner mit dem Standardprogramm des Betriebssystems.',
  category: 'datei',
  readOnly: true,
  input: z.object({ pfad: z.string() }),
  handler: async (input, ctx) => {
    const r = await ctx.system.openPath(input.pfad);
    if (!r.ok) return r;
    ctx.audit.log({
      actor: ctx.agent,
      action: 'datei.geoeffnet',
      summary: `Geöffnet: ${r.data.path}`,
    });
    return ok({ geoeffnet: r.data.path });
  },
});

export const readFileTool = defineTool({
  name: 'read_file',
  description: 'Liest den Inhalt einer Textdatei aus einem freigegebenen Verzeichnis.',
  category: 'datei',
  readOnly: true,
  input: z.object({ pfad: z.string(), maxZeichen: z.number().int().min(100).max(100_000).optional() }),
  handler: async (input, ctx) => {
    const r = await ctx.system.readTextFile(input.pfad, input.maxZeichen ?? 20_000);
    if (!r.ok) return r;
    return ok({ pfad: r.data.path, inhalt: r.data.inhalt, gekuerzt: r.data.gekuerzt });
  },
});

export const createFileTool = defineTool({
  name: 'create_file',
  description:
    'Legt eine Textdatei an. Existiert die Datei bereits, wird nicht überschrieben, sondern eine Freigabe angefragt.',
  category: 'datei',
  readOnly: false,
  input: z.object({
    pfad: z.string(),
    inhalt: z.string(),
  }),
  handler: async (input, ctx) => {
    const safe = ctx.system.resolveSafePath(input.pfad);
    if (!safe.ok) return safe;

    if (await ctx.system.fileExists(safe.data)) {
      const approval = ctx.approvals.request({
        actionType: 'datei.ueberschreiben',
        title: 'Datei überschreiben',
        summary: `Die Datei ${safe.data} existiert bereits. Überschreiben?`,
        payload: { pfad: safe.data, inhalt: input.inhalt },
        risk: 'hoch',
        requestedBy: ctx.agent,
        details: [
          { label: 'Datei', value: safe.data },
          { label: 'Neuer Inhalt (Auszug)', value: truncate(input.inhalt, 1500), kind: 'long' },
        ],
      });
      return err('APPROVAL_REQUIRED', `Die Datei ${safe.data} existiert bereits.`, {
        hint: 'Der Benutzer muss das Überschreiben freigeben.',
        detail: { freigabeId: approval.id },
      });
    }

    const r = await ctx.system.writeTextFile(safe.data, input.inhalt);
    if (!r.ok) return r;
    ctx.audit.log({
      actor: ctx.agent,
      action: 'datei.erstellt',
      summary: `Datei erstellt: ${r.data.path} (${r.data.bytes} Byte)`,
    });
    return ok({ pfad: r.data.path, bytes: r.data.bytes });
  },
});

export const deleteFileTool = defineTool({
  name: 'delete_file',
  description: 'Fragt die Freigabe zum Löschen einer Datei an. Löscht selbst nichts.',
  category: 'datei',
  readOnly: false,
  input: z.object({ pfad: z.string(), grund: z.string().optional() }),
  handler: async (input, ctx) => {
    const safe = ctx.system.resolveSafePath(input.pfad);
    if (!safe.ok) return safe;
    if (!(await ctx.system.fileExists(safe.data))) {
      return err('NOT_FOUND', `Die Datei ${safe.data} existiert nicht.`);
    }
    const approval = ctx.approvals.request({
      actionType: 'datei.loeschen',
      title: 'Datei löschen',
      summary: `Datei ${safe.data} endgültig löschen?`,
      payload: { pfad: safe.data },
      risk: 'hoch',
      requestedBy: ctx.agent,
      details: [
        { label: 'Datei', value: safe.data },
        ...(input.grund ? [{ label: 'Begründung', value: input.grund }] : []),
      ],
    });
    return ok({
      freigabeId: approval.id,
      status: 'Wartet auf Freigabe',
      hinweis: 'Die Datei wird erst gelöscht, wenn der Benutzer zustimmt.',
    });
  },
});

export const openApplicationTool = defineTool({
  name: 'open_application',
  description: 'Startet ein Programm auf dem Rechner über den Standardweg des Betriebssystems.',
  category: 'system',
  readOnly: false,
  input: z.object({ programm: z.string().min(1) }),
  handler: async (input, ctx) => {
    const r = await ctx.system.openApplication(input.programm);
    if (!r.ok) return r;
    ctx.audit.log({ actor: ctx.agent, action: 'system.programm', summary: `Programm gestartet: ${r.data.programm}` });
    return ok({ gestartet: r.data.programm });
  },
});

export const openWebsiteInBrowserTool = defineTool({
  name: 'open_url_in_browser',
  description: 'Öffnet eine Webadresse im Standardbrowser des Benutzers.',
  category: 'system',
  readOnly: false,
  input: z.object({ url: z.string() }),
  handler: async (input, ctx) => {
    const r = await ctx.system.openUrl(input.url);
    if (!r.ok) return r;
    ctx.audit.log({ actor: ctx.agent, action: 'system.browser', summary: `Im Browser geöffnet: ${r.data.url}` });
    return ok({ geoeffnet: r.data.url });
  },
});

export const clipboardTool = defineTool({
  name: 'use_clipboard',
  description: 'Liest die Zwischenablage oder legt Text hinein.',
  category: 'system',
  readOnly: false,
  input: z.object({ aktion: z.enum(['lesen', 'schreiben']), text: z.string().optional() }),
  handler: async (input, ctx) => {
    if (input.aktion === 'lesen') {
      const r = ctx.system.readClipboard();
      return r.ok ? ok({ text: r.data.text }) : r;
    }
    if (!input.text) return err('INVALID_INPUT', 'Zum Schreiben fehlt der Text.');
    const r = ctx.system.writeClipboard(input.text);
    return r.ok ? ok({ geschrieben: r.data.zeichen }) : r;
  },
});

export const checkCalendarTool = defineTool({
  name: 'check_calendar',
  description: 'Zeigt anstehende Termine aus dem hinterlegten Kalender.',
  category: 'kalender',
  readOnly: true,
  input: z.object({
    vonTagen: z.number().int().min(-365).max(365).optional().describe('Startversatz in Tagen, Standard 0 (heute).'),
    bisTagen: z.number().int().min(0).max(365).optional().describe('Endversatz in Tagen, Standard 7.'),
  }),
  handler: async (input, ctx) => {
    if (!ctx.calendar.isConfigured()) {
      return err('NOT_CONFIGURED', 'Es ist kein Kalender hinterlegt.', {
        hint: 'In den Einstellungen eine ICS-Adresse oder .ics-Datei angeben.',
      });
    }
    const jetzt = Date.now();
    const from = new Date(jetzt + (input.vonTagen ?? 0) * 86_400_000);
    const to = new Date(jetzt + (input.bisTagen ?? 7) * 86_400_000);
    const r = await ctx.calendar.events({ from, to });
    if (!r.ok) return r;
    return ok({
      zeitraum: { von: from.toISOString(), bis: to.toISOString() },
      anzahl: r.data.length,
      termine: r.data.map((e) => ({
        titel: e.summary,
        beginn: e.start,
        ende: e.end,
        ganztaegig: e.allDay,
        ort: e.location,
      })),
    });
  },
  summarize: (_i, r) => (r.ok ? `${(r.data as { anzahl: number }).anzahl} Termine` : r.error.message),
});

export const fileTools: AnyTool[] = [
  searchFilesTool,
  openFileTool,
  readFileTool,
  createFileTool,
  deleteFileTool,
  openApplicationTool,
  openWebsiteInBrowserTool,
  clipboardTool,
  checkCalendarTool,
];
