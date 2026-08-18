import type { EventName, JarvisEvents } from '../services/events.js';
import type { Result } from '../util/result.js';

/**
 * Vertrag zwischen Hauptprozess und Fenster.
 *
 * Statt dreissig einzelner Kanaele gibt es einen Befehlskanal mit einer
 * ausgezeichneten Union. Ein neuer Befehl wird hier eingetragen, und
 * TypeScript zeigt sofort, wo er noch behandelt werden muss.
 */

export const IPC_COMMAND_CHANNEL = 'jarvis:befehl';
export const IPC_EVENT_CHANNEL = 'jarvis:ereignis';

export type Command =
  // --- Gespraech ---------------------------------------------------------
  | { kind: 'ask'; text: string; conversationId?: string }
  | { kind: 'abort' }
  | { kind: 'conversations' }
  | { kind: 'conversation.messages'; conversationId: string }
  | { kind: 'conversation.new'; title?: string }
  | { kind: 'conversation.delete'; conversationId: string }

  // --- Uebersicht --------------------------------------------------------
  | { kind: 'dashboard' }

  // --- Freigaben ---------------------------------------------------------
  | { kind: 'approvals.pending' }
  | { kind: 'approvals.all'; limit?: number }
  | { kind: 'approvals.approve'; approvalId: string; note?: string }
  | { kind: 'approvals.reject'; approvalId: string; note?: string }

  // --- Mail --------------------------------------------------------------
  | { kind: 'drafts.list'; status?: string; campaignId?: string }
  | { kind: 'drafts.get'; emailId: string }
  | { kind: 'drafts.update'; emailId: string; patch: { to?: string; subject?: string; body?: string } }
  | { kind: 'drafts.delete'; emailId: string }
  | { kind: 'drafts.requestApproval'; emailId: string }
  | { kind: 'drafts.requestBulkApproval'; emailIds: string[] }
  | { kind: 'drafts.spoken'; emailId: string }
  | { kind: 'mail.checkReplies'; seitTagen?: number }
  | { kind: 'mail.verifyTransport' }

  // --- Recherche und CRM -------------------------------------------------
  | { kind: 'companies.list'; search?: string; city?: string; limit?: number }
  | { kind: 'companies.dossier'; companyId: string }
  | { kind: 'companies.delete'; companyId: string }
  | { kind: 'campaigns.list' }
  | { kind: 'campaigns.sendingCenter'; campaignId?: string }

  // --- Compliance --------------------------------------------------------
  | { kind: 'suppression.list' }
  | { kind: 'suppression.add'; scope: 'email' | 'domain' | 'firma'; value: string; reason?: string }
  | { kind: 'suppression.remove'; id: string }

  // --- Gedaechtnis, Aufgaben, Protokoll ----------------------------------
  | { kind: 'memory.list'; kind_?: string }
  | { kind: 'memory.delete'; id: string }
  | { kind: 'memory.clear'; kind_?: string }
  | { kind: 'tasks.list' }
  | { kind: 'audit.list'; limit?: number; entityType?: string; entityId?: string }

  // --- Einrichtung -------------------------------------------------------
  | { kind: 'status' }
  | { kind: 'settings.all' }
  | { kind: 'settings.set'; key: string; value: unknown }
  | { kind: 'secrets.list' }
  | { kind: 'secrets.set'; key: string; value: string }
  | { kind: 'secrets.delete'; key: string }
  | { kind: 'oauth.start'; provider: 'google' | 'microsoft' }
  | { kind: 'tools.list' }

  // --- Sprachmodell ------------------------------------------------------
  | { kind: 'llm.status' }
  | { kind: 'llm.use'; provider: 'anthropic' | 'openai' | 'ollama'; model?: string }
  | { kind: 'llm.pull'; model: string }
  | { kind: 'llm.test'; model?: string }

  // --- Dateizugriff ------------------------------------------------------
  | { kind: 'system.roots' }
  | { kind: 'system.setRoots'; pfade: string[] }
  | { kind: 'system.knownApps' }

  // --- Sprache -----------------------------------------------------------
  | { kind: 'voice.transcribe'; audio: ArrayBuffer; filename?: string }
  | { kind: 'voice.speak'; text: string }

  // --- System ------------------------------------------------------------
  | { kind: 'system.openExternal'; url: string }
  | { kind: 'system.revealPath'; path: string };

export type CommandKind = Command['kind'];

/** Antwort auf einen Befehl -- immer im Result-Format. */
export type CommandResponse = Result<unknown>;

export interface IpcEventEnvelope {
  name: EventName;
  payload: JarvisEvents[EventName];
}

/**
 * Die Schnittstelle, die das Vorlade-Skript im Fenster bereitstellt.
 * Im Renderer erreichbar als `window.jarvis`.
 */
export interface JarvisBridge {
  invoke(command: Command): Promise<CommandResponse>;
  onEvent(handler: (event: IpcEventEnvelope) => void): () => void;
  readonly plattform: string;
  readonly version: string;
}
