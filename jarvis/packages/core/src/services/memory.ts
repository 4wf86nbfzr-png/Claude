import type { ConversationRepo, MemoryRepo } from '../db/repos/misc.js';
import type { MemoryRow, MessageRow } from '../db/schema.js';
import { truncate } from '../util/text.js';

/**
 * Gedaechtnis mit klarer Trennung nach Art -- und ohne pauschales Mitschneiden
 * aller Gespraeche. Gespeichert wird nur, was der Nutzer sagt ("merk dir ...")
 * oder was ein Agent bewusst ablegt.
 */
export const MEMORY_KINDS = {
  praeferenz: 'Vorlieben und Arbeitsweise',
  fakt: 'Feste Angaben (Firma, Signatur, Leistungen)',
  person: 'Personen',
  projekt: 'Projekte und Vorhaben',
} as const;

export type MemoryKind = keyof typeof MEMORY_KINDS;

export class MemoryService {
  constructor(
    private readonly memory: MemoryRepo,
    private readonly conversations: ConversationRepo,
  ) {}

  remember(input: { kind: MemoryKind; key: string; value: string; importance?: number; source?: string }): MemoryRow {
    return this.memory.set(input);
  }

  forget(id: string): boolean {
    return this.memory.delete(id);
  }

  forgetAll(kind?: MemoryKind): number {
    return this.memory.deleteAll(kind);
  }

  list(kind?: MemoryKind): MemoryRow[] {
    return this.memory.list(kind);
  }

  /**
   * Kompakter Block fuer den System-Prompt. Bewusst kurz gehalten -- das
   * Gedaechtnis soll den Kontext ergaenzen, nicht fluten.
   */
  contextBlock(maxChars = 2000): string {
    const rows = this.memory.list();
    if (rows.length === 0) return '';
    const lines: string[] = [];
    for (const kind of Object.keys(MEMORY_KINDS) as MemoryKind[]) {
      const ofKind = rows.filter((r) => r.kind === kind);
      if (ofKind.length === 0) continue;
      lines.push(`${MEMORY_KINDS[kind]}:`);
      for (const r of ofKind) lines.push(`- ${r.key}: ${r.value}`);
    }
    return truncate(lines.join('\n'), maxChars);
  }

  // --- Gespraeche ---------------------------------------------------------

  startConversation(title = 'Neues Gespräch'): string {
    return this.conversations.create(title).id;
  }

  history(conversationId: string, limit = 40): MessageRow[] {
    const all = this.conversations.messages(conversationId, 500);
    return all.slice(-limit);
  }

  appendUser(conversationId: string, content: string): MessageRow {
    return this.conversations.addMessage({ conversationId, role: 'user', content });
  }

  appendAssistant(conversationId: string, content: string, agent?: string, toolCalls?: unknown): MessageRow {
    return this.conversations.addMessage({ conversationId, role: 'assistant', content, agent: agent ?? null, toolCalls });
  }

  appendTool(conversationId: string, toolCallId: string, content: string): MessageRow {
    return this.conversations.addMessage({ conversationId, role: 'tool', content, toolCallId });
  }

  deleteConversation(id: string): boolean {
    return this.conversations.delete(id);
  }

  listConversations(limit = 30) {
    return this.conversations.list(limit);
  }
}
