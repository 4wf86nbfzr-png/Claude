import { z } from 'zod/v4';
import { ok } from '../../shared/types.js';
import { defineTool } from './Tool.js';

export const openApplicationTool = defineTool({
  name: 'open_application',
  agent: 'SystemAgent',
  description:
    'Startet ein Programm auf dem Rechner des Benutzers, z. B. "Mail", "Calendar", "Excel". Verwendet die offizielle Startmethode des Betriebssystems, keine Maus- oder Tastatursimulation.',
  schema: z.object({
    name: z.string().min(1).describe('Programmname, wie ihn das Betriebssystem kennt'),
  }),
  summarize: (input) => `Programm starten: ${input.name}`,
  async run(input, context) {
    context.status(`Starte ${input.name} …`);
    return context.agents.system.openApplication(input.name);
  },
});

export const openFileTool = defineTool({
  name: 'open_file',
  agent: 'SystemAgent',
  description:
    'Öffnet eine Datei oder einen Ordner im zuständigen Programm des Betriebssystems.',
  schema: z.object({
    path: z.string().min(1),
  }),
  summarize: (input) => `Öffnen: ${input.path}`,
  async run(input, context) {
    const resolved = context.agents.file.resolveInsideRoots(input.path);
    if (!resolved.ok) return resolved;
    return context.agents.system.openPath(resolved.value);
  },
});

export const searchFilesTool = defineTool({
  name: 'search_files',
  agent: 'FileAgent',
  description:
    'Sucht Dateien innerhalb der freigegebenen Ordner anhand eines Namensbestandteils.',
  schema: z.object({
    pattern: z.string().min(2),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  summarize: (input) => `Dateien suchen: „${input.pattern}"`,
  async run(input, context) {
    context.status(`Suche Dateien: ${input.pattern}`);
    const hits = await context.agents.file.search(input.pattern, input.limit);
    if (!hits.ok) return hits;
    return ok(
      hits.value.map((hit) => ({ pfad: hit.path, groesse: hit.size, geaendert: hit.modifiedAt })),
    );
  },
});

export const readFileTool = defineTool({
  name: 'read_file',
  agent: 'FileAgent',
  description: 'Liest eine Textdatei innerhalb der freigegebenen Ordner.',
  schema: z.object({
    path: z.string().min(1),
  }),
  summarize: (input) => `Datei lesen: ${input.path}`,
  async run(input, context) {
    const content = await context.agents.file.read(input.path);
    if (!content.ok) return content;
    return ok({ pfad: input.path, inhalt: content.value });
  },
});

export const createFileTool = defineTool({
  name: 'create_file',
  agent: 'FileAgent',
  description:
    'Schreibt eine Textdatei in einen freigegebenen Ordner. Existiert die Datei bereits, ist eine Freigabe des Benutzers nötig — dann zuerst request_file_overwrite aufrufen.',
  schema: z.object({
    path: z.string().min(1),
    content: z.string(),
  }),
  summarize: (input) => `Datei schreiben: ${input.path}`,
  async run(input, context) {
    const written = await context.agents.file.create(input.path, input.content);
    if (!written.ok) return written;
    return ok({ pfad: written.value, zeichen: input.content.length });
  },
});

export const requestFileOverwriteTool = defineTool({
  name: 'request_file_overwrite',
  agent: 'FileAgent',
  description: 'Fordert die Freigabe an, eine bestehende Datei zu überschreiben. Schreibt nichts.',
  approvalAction: 'file.overwrite',
  schema: z.object({
    path: z.string().min(1),
    content: z.string(),
  }),
  summarize: (input) => `Freigabe zum Überschreiben: ${input.path}`,
  async run(input, context) {
    return context.agents.file.requestOverwrite(input.path, input.content);
  },
});

export const requestFileDeleteTool = defineTool({
  name: 'request_file_delete',
  agent: 'FileAgent',
  description: 'Fordert die Freigabe an, eine Datei zu löschen. Löscht nichts.',
  approvalAction: 'file.delete',
  schema: z.object({
    path: z.string().min(1),
  }),
  summarize: (input) => `Freigabe zum Löschen: ${input.path}`,
  async run(input, context) {
    return context.agents.file.requestDelete(input.path);
  },
});

export const deleteFileTool = defineTool({
  name: 'delete_file',
  agent: 'FileAgent',
  description:
    'Löscht eine Datei — ausschließlich, wenn der Benutzer genau dieses Löschen freigegeben hat.',
  approvalAction: 'file.delete',
  schema: z.object({
    path: z.string().min(1),
  }),
  summarize: (input) => `Datei löschen: ${input.path}`,
  async run(input, context) {
    const deleted = await context.agents.file.deleteApproved(input.path);
    if (!deleted.ok) return deleted;
    return ok({ geloescht: input.path });
  },
});

export const clipboardTool = defineTool({
  name: 'use_clipboard',
  agent: 'SystemAgent',
  description: 'Liest die Zwischenablage oder schreibt Text hinein.',
  schema: z.object({
    action: z.enum(['read', 'write']),
    text: z.string().optional().describe('Nur bei action=write'),
  }),
  summarize: (input) => (input.action === 'read' ? 'Zwischenablage lesen' : 'In Zwischenablage schreiben'),
  async run(input, context) {
    if (input.action === 'read') {
      const value = context.agents.system.readClipboard();
      if (!value.ok) return value;
      return ok({ inhalt: value.value, meldung: 'Zwischenablage gelesen.' });
    }
    const written = context.agents.system.copyToClipboard(input.text ?? '');
    if (!written.ok) return written;
    return ok({ inhalt: input.text ?? '', meldung: written.value });
  },
});
