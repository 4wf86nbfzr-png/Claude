import type { JarvisContext } from '../context.js';
import type { ApprovalService } from '../services/approval.js';
import type { SystemService } from '../system/index.js';
import type { AuditLogService } from '../services/audit.js';
import { assistantTools } from './assistant.js';
import { crmTools } from './crm.js';
import { fileTools } from './files.js';
import { mailTools } from './mail.js';
import { researchTools } from './research.js';
import { ToolRegistry, type AnyTool } from './types.js';
import { err, ok } from '../util/result.js';

export * from './types.js';
export * from './research.js';
export * from './mail.js';
export * from './crm.js';
export * from './files.js';
export * from './assistant.js';

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll([...researchTools, ...mailTools, ...crmTools, ...fileTools, ...assistantTools]);
  return registry;
}

/**
 * Haengt die Ausfuehrung fuer Datei-Freigaben ein.
 *
 * Der Mailversand registriert sich selbst im MailService-Konstruktor; hier
 * kommen die uebrigen kritischen Aktionen dazu. Ohne diesen Aufruf kann eine
 * freigegebene Loeschung schlicht nicht ausgefuehrt werden -- das ist Absicht.
 */
export function registerSystemExecutors(
  approvals: ApprovalService,
  system: SystemService,
  audit: AuditLogService,
): void {
  approvals.registerExecutor('datei.loeschen', async (payload) => {
    const pfad = String(payload.pfad ?? '');
    if (!pfad) return err('INVALID_INPUT', 'Im Freigabedatensatz fehlt der Dateipfad.');
    const r = await system.deleteFile(pfad);
    if (r.ok) {
      audit.log({ actor: 'benutzer', action: 'datei.geloescht', summary: `Datei gelöscht: ${r.data.path}` });
    }
    return r;
  });

  approvals.registerExecutor('datei.ueberschreiben', async (payload) => {
    const pfad = String(payload.pfad ?? '');
    const inhalt = typeof payload.inhalt === 'string' ? payload.inhalt : null;
    if (!pfad || inhalt === null) return err('INVALID_INPUT', 'Im Freigabedatensatz fehlen Pfad oder Inhalt.');
    const r = await system.writeTextFile(pfad, inhalt);
    if (r.ok) {
      audit.log({ actor: 'benutzer', action: 'datei.ueberschrieben', summary: `Datei überschrieben: ${r.data.path}` });
    }
    return r;
  });

  // Programminstallation und Systemeinstellungen sind in Version 1 bewusst
  // nicht ausfuehrbar: die Freigabe kann angefragt werden, die Ausfuehrung
  // meldet aber ehrlich, dass es dafuer noch keinen Weg gibt.
  for (const action of ['programm.installieren', 'system.einstellung'] as const) {
    approvals.registerExecutor(action, async () =>
      err('NOT_IMPLEMENTED', 'Diese Aktion ist in Version 1 nicht ausführbar.', {
        hint: 'Bitte manuell durchführen — JARVIS führt keine Installationen und keine Systemänderungen aus.',
      }),
    );
  }
}

/** Nur lesende Tools -- fuer Agenten, die nichts veraendern duerfen. */
export function readOnlyToolNames(registry: ToolRegistry): string[] {
  return registry.names().filter((n) => registry.get(n)?.readOnly === true);
}

/** Kurzer Ueberblick fuer die Oberflaeche. */
export function describeTools(registry: ToolRegistry): Array<{ name: string; beschreibung: string; kategorie: string; nurLesend: boolean }> {
  return registry.names().map((n) => {
    const t = registry.get(n) as AnyTool;
    return { name: t.name, beschreibung: t.description, kategorie: t.category, nurLesend: t.readOnly };
  });
}

/** Hilfsfunktion fuer Tests: minimaler Kontext mit gefaelschten Diensten. */
export function assertContextComplete(ctx: JarvisContext): void {
  const fehlend = (['repos', 'audit', 'approvals', 'mail', 'research', 'outreach', 'system', 'calendar'] as const).filter(
    (k) => ctx[k] === undefined || ctx[k] === null,
  );
  if (fehlend.length > 0) {
    throw new Error(`Der Kontext ist unvollständig, es fehlen: ${fehlend.join(', ')}`);
  }
}

export { ok, err };
