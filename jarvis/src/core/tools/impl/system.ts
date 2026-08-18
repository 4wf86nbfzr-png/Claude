import { z } from 'zod';
import { fail, ok, type ToolDefinition } from '../types';

const appSchema = z.object({ name: z.string().min(1).describe('Name des Programms, z. B. "Rechner" oder "firefox"') });

const openApplication: ToolDefinition = {
  name: 'open_application',
  agent: 'SystemAgent',
  description:
    'Startet ein Programm über den offiziellen Weg des Betriebssystems. Es wird keine Maus- oder Tastatureingabe simuliert.',
  schema: appSchema,
  execute: async (input, context) => {
    const { name } = input as z.infer<typeof appSchema>;
    try {
      await context.system.oeffneProgramm(name);
      return ok(`${name} wurde gestartet.`, { programm: name });
    } catch (error) {
      return fail(`${name} konnte nicht gestartet werden: ${(error as Error).message}`);
    }
  }
};

const urlSchema = z.object({ url: z.string().url().describe('Zu öffnende Adresse') });

const openUrl: ToolDefinition = {
  name: 'open_url',
  agent: 'BrowserAgent',
  description: 'Öffnet eine Adresse im Standardbrowser des Benutzers.',
  schema: urlSchema,
  execute: async (input, context) => {
    const { url } = input as z.infer<typeof urlSchema>;
    try {
      await context.system.oeffneUrl(url);
      return ok(`${url} im Browser geöffnet.`, { url });
    } catch (error) {
      return fail(`${url} konnte nicht geöffnet werden: ${(error as Error).message}`);
    }
  }
};

const pfadSchema = z.object({ pfad: z.string().min(1).describe('Datei oder Ordner') });

const openPath: ToolDefinition = {
  name: 'open_file',
  agent: 'FileAgent',
  description: 'Öffnet eine Datei oder einen Ordner mit dem zuständigen Programm.',
  schema: pfadSchema,
  execute: async (input, context) => {
    const { pfad } = input as z.infer<typeof pfadSchema>;
    try {
      const absolut = await context.system.oeffnePfad(pfad);
      return ok(`${absolut} geöffnet.`, { pfad: absolut });
    } catch (error) {
      return fail(`Konnte nicht geöffnet werden: ${(error as Error).message}`);
    }
  }
};

const sucheSchema = z.object({
  muster: z.string().min(2).describe('Namensbestandteil der gesuchten Datei'),
  verzeichnis: z.string().optional().describe('Startverzeichnis; Standard ist das Benutzerverzeichnis'),
  maxTreffer: z.number().int().min(1).max(100).optional()
});

const searchFiles: ToolDefinition = {
  name: 'search_files',
  agent: 'FileAgent',
  description: 'Sucht Dateien nach Namensbestandteil in den freigegebenen Verzeichnissen.',
  schema: sucheSchema,
  execute: async (input, context) => {
    const { muster, verzeichnis, maxTreffer } = input as z.infer<typeof sucheSchema>;
    try {
      const treffer = await context.system.dateiSuche(muster, verzeichnis, maxTreffer ?? 25);
      return ok(`${treffer.length} Datei(en) gefunden.`, { anzahl: treffer.length, treffer });
    } catch (error) {
      return fail(`Suche fehlgeschlagen: ${(error as Error).message}`);
    }
  }
};

const readSchema = z.object({ pfad: z.string().min(1), maxZeichen: z.number().int().min(100).max(200000).optional() });

const readFile: ToolDefinition = {
  name: 'read_file',
  agent: 'FileAgent',
  description: 'Liest eine Textdatei aus den freigegebenen Verzeichnissen.',
  schema: readSchema,
  execute: async (input, context) => {
    const { pfad, maxZeichen } = input as z.infer<typeof readSchema>;
    try {
      const inhalt = await context.system.dateiLesen(pfad, maxZeichen ?? 200_000);
      return ok(`${pfad} gelesen.`, { pfad, inhalt });
    } catch (error) {
      return fail(`Datei nicht lesbar: ${(error as Error).message}`);
    }
  }
};

const createSchema = z.object({
  pfad: z.string().min(1).describe('Zielpfad der neuen Datei'),
  inhalt: z.string().describe('Dateiinhalt')
});

const createFile: ToolDefinition = {
  name: 'create_file',
  agent: 'FileAgent',
  description:
    'Legt eine neue Textdatei an. Eine vorhandene Datei wird NICHT überschrieben – dafür gibt es overwrite_file mit Freigabe.',
  schema: createSchema,
  execute: async (input, context) => {
    const { pfad, inhalt } = input as z.infer<typeof createSchema>;
    try {
      const absolut = await context.system.dateiSchreiben(pfad, inhalt, false);
      return ok(`${absolut} angelegt.`, { pfad: absolut, zeichen: inhalt.length });
    } catch (error) {
      return fail(`Datei konnte nicht angelegt werden: ${(error as Error).message}`);
    }
  }
};

const overwriteSchema = z.object({
  pfad: z.string().min(1),
  inhalt: z.string(),
  approvalId: z.number().int().describe('Nummer der erteilten Freigabe')
});

const overwriteFile: ToolDefinition = {
  name: 'overwrite_file',
  agent: 'FileAgent',
  criticalAction: 'overwrite_file',
  description: 'Überschreibt eine vorhandene Datei. Freigabepflichtig.',
  schema: overwriteSchema,
  execute: async (input, context) => {
    const { pfad, inhalt } = input as z.infer<typeof overwriteSchema>;
    try {
      const absolut = await context.system.dateiSchreiben(pfad, inhalt, true);
      return ok(`${absolut} überschrieben.`, { pfad: absolut });
    } catch (error) {
      return fail(`Überschreiben fehlgeschlagen: ${(error as Error).message}`);
    }
  }
};

const deleteSchema = z.object({
  pfad: z.string().min(1),
  approvalId: z.number().int().describe('Nummer der erteilten Freigabe')
});

const deleteFile: ToolDefinition = {
  name: 'delete_file',
  agent: 'FileAgent',
  criticalAction: 'delete_file',
  description: 'Löscht eine Datei. Freigabepflichtig.',
  schema: deleteSchema,
  execute: async (input, context) => {
    const { pfad } = input as z.infer<typeof deleteSchema>;
    try {
      const absolut = await context.system.dateiLoeschen(pfad);
      return ok(`${absolut} gelöscht.`, { pfad: absolut });
    } catch (error) {
      return fail(`Löschen fehlgeschlagen: ${(error as Error).message}`);
    }
  }
};

const clipboardSchema = z.object({ text: z.string().min(1) });

const clipboardWrite: ToolDefinition = {
  name: 'clipboard_write',
  agent: 'SystemAgent',
  description: 'Legt Text in die Zwischenablage.',
  schema: clipboardSchema,
  execute: async (input, context) => {
    const { text } = input as z.infer<typeof clipboardSchema>;
    try {
      context.system.zwischenablageSchreiben(text);
      return ok(`${text.length} Zeichen in die Zwischenablage gelegt.`);
    } catch (error) {
      return fail((error as Error).message);
    }
  }
};

const requestApprovalSchema = z.object({
  aktion: z
    .enum([
      'delete_file',
      'overwrite_file',
      'install_application',
      'change_system_setting',
      'paid_action',
      'modify_account',
      'publish_content',
      'submit_form',
      'message_external_person'
    ])
    .describe('Welche freigabepflichtige Aktion vorbereitet wird'),
  titel: z.string().min(3).describe('Kurzbeschreibung für die Freigabekarte'),
  beschreibung: z.string().min(3).describe('Was genau passieren würde'),
  parameter: z.record(z.string(), z.unknown()).describe('Die Parameter, mit denen das Werkzeug danach aufgerufen wird')
});

/**
 * Freigabe für die übrigen kritischen Aktionen anfordern.
 * (Für den Mailversand gibt es das eigene request_send_approval mit Vorschau.)
 */
const requestApproval: ToolDefinition = {
  name: 'request_approval',
  agent: 'ApprovalService',
  description:
    'Fordert die Freigabe für eine kritische Aktion an (Datei löschen, überschreiben, Programm installieren …). ' +
    'Gibt die Freigabe-Nummer zurück, die das eigentliche Werkzeug danach benötigt.',
  schema: requestApprovalSchema,
  execute: async (input, context) => {
    const daten = input as z.infer<typeof requestApprovalSchema>;
    const { payloadHash } = await import('../../util/hash');
    const approval = context.approvals.request({
      action: daten.aktion,
      title: daten.titel,
      summary: daten.beschreibung,
      payload: daten.parameter,
      contentHash: payloadHash(daten.parameter),
      ttlMinutes: context.config.limits.approvalTtlMinutes
    });
    return ok(`Freigabe ${approval.id} angefragt: ${daten.titel}.`, {
      approvalId: approval.id,
      aktion: daten.aktion,
      hinweis: 'Erst nach ausdrücklicher Freigabe darf das Werkzeug aufgerufen werden.'
    }, { approvalId: approval.id });
  }
};

export const systemTools: ToolDefinition[] = [
  openApplication,
  openUrl,
  openPath,
  searchFiles,
  readFile,
  createFile,
  overwriteFile,
  deleteFile,
  clipboardWrite,
  requestApproval
];
