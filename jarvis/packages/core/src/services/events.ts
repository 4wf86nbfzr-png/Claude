import { EventEmitter } from 'node:events';
import type { ApprovalRow, AuditRow } from '../db/schema.js';

/**
 * Der Core meldet Zustandsaenderungen; Oberflaeche und Sprachausgabe haengen
 * sich hier ein. Der Core kennt weder Electron noch React.
 */
export interface JarvisEvents {
  /** Statuszeile: LISTENING / THINKING / EXECUTING / WAITING FOR APPROVAL */
  status: { state: AssistantState; detail?: string };
  /** Laufende Rueckmeldung waehrend langer Aufgaben ("12 von 30 geprueft"). */
  progress: { task: string; done: number; total: number | null; note?: string };
  /** Textstueck der Antwort (Streaming). */
  delta: { conversationId: string; text: string };
  /** Vollstaendige Antwort eines Agenten. */
  message: { conversationId: string; role: 'assistant' | 'user'; content: string; agent?: string };
  /** Ein Tool wurde ausgefuehrt. */
  tool: { name: string; ok: boolean; summary: string; agent: string };
  /** Neue Freigabeanfrage bzw. Statuswechsel. */
  approval: ApprovalRow;
  /** Neue Zeile im Audit-Log. */
  audit: AuditRow;
  /** Daten wurden geaendert -- die Oberflaeche soll neu laden. */
  invalidate: { scope: 'companies' | 'emails' | 'campaigns' | 'approvals' | 'tasks' | 'memory' | 'alle' };
  /** JARVIS moechte etwas sagen (Text-to-Speech). */
  speak: { text: string; interrupt?: boolean };
  /** Fehler, der dem Nutzer gezeigt werden muss. */
  error: { message: string; hint?: string; detail?: unknown };
}

export type AssistantState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'WAITING FOR APPROVAL'
  | 'ERROR';

export type EventName = keyof JarvisEvents;

export class EventBus {
  private readonly emitter = new EventEmitter();

  /**
   * Alle Kanaele bekommen ein Praefix.
   *
   * Grund: `error` ist bei Node-EventEmittern reserviert -- ein `emit('error')`
   * ohne Zuhoerer wirft eine Ausnahme und wuerde die Anwendung beenden.
   * Ausgerechnet der Fehlerkanal darf aber niemals selbst zum Absturz fuehren.
   */
  private channel(name: string): string {
    return `jarvis:${name}`;
  }

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<K extends EventName>(name: K, payload: JarvisEvents[K]): void {
    this.emitter.emit(this.channel(name), payload);
    this.emitter.emit(this.channel('*'), { name, payload });
  }

  on<K extends EventName>(name: K, handler: (payload: JarvisEvents[K]) => void): () => void {
    const channel = this.channel(name);
    this.emitter.on(channel, handler as (...args: unknown[]) => void);
    return () => this.emitter.off(channel, handler as (...args: unknown[]) => void);
  }

  /** Alle Ereignisse -- der Electron-Hauptprozess leitet sie ans Fenster weiter. */
  onAny(handler: (e: { name: EventName; payload: unknown }) => void): () => void {
    const channel = this.channel('*');
    this.emitter.on(channel, handler as (...args: unknown[]) => void);
    return () => this.emitter.off(channel, handler as (...args: unknown[]) => void);
  }

  removeAll(): void {
    this.emitter.removeAllListeners();
  }
}
