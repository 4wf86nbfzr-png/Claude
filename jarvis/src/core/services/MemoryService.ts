import type { ChatMessage, MemoryEntry, MemoryKind } from '../../shared/types.js';
import type { ConversationRepository, MemoryRepository } from '../db/repositories/misc.js';
import { isoPlus } from '../util/id.js';

/**
 * Structured local memory (§13).
 *
 * Conversation turns are stored so a session can be resumed, but they expire
 * after `conversationRetentionDays`. Anything meant to last — preferences,
 * facts about the user's own business — must be written explicitly through
 * `remember()`, which is what the `remember_preference` tool calls. Nothing is
 * captured silently beyond the transcript.
 */
export class MemoryService {
  constructor(
    private readonly memory: MemoryRepository,
    private readonly conversations: ConversationRepository,
    private readonly conversationRetentionDays = 30,
  ) {}

  /* ---------------- conversation ---------------- */

  appendTurn(message: ChatMessage): void {
    this.conversations.append(message);
  }

  history(conversationId: string, limit = 40): ChatMessage[] {
    return this.conversations.history(conversationId, limit);
  }

  latestConversationId(): string | null {
    return this.conversations.latestConversationId();
  }

  /* ---------------- durable memory ---------------- */

  remember(kind: MemoryKind, key: string | null, value: string, scope?: string): MemoryEntry {
    return this.memory.put({
      kind,
      key,
      value,
      scope: scope ?? null,
      // Preferences and facts are kept until deleted; notes expire with the
      // conversation retention window.
      expiresAt: kind === 'note' ? isoPlus(this.conversationRetentionDays * 86400) : null,
    });
  }

  recall(kind: MemoryKind, key: string): MemoryEntry | null {
    return this.memory.get(kind, key);
  }

  list(kind?: string): MemoryEntry[] {
    return this.memory.list(kind);
  }

  forget(id: number): boolean {
    return this.memory.remove(id);
  }

  clear(kind?: string): number {
    if (kind === 'conversation') {
      return this.conversations.purgeOlderThan(new Date().toISOString());
    }
    return this.memory.clear(kind);
  }

  /** Called on startup: drops expired notes and stale conversations. */
  housekeeping(): { memoryPurged: number; conversationsPurged: number } {
    const memoryPurged = this.memory.purgeExpired();
    const cutoff = new Date(Date.now() - this.conversationRetentionDays * 86400 * 1000).toISOString();
    const conversationsPurged = this.conversations.purgeOlderThan(cutoff);
    return { memoryPurged, conversationsPurged };
  }

  /** Compact preference block injected into the system prompt. */
  preferenceDigest(): string {
    const preferences = this.memory.list('preference', 40);
    const facts = this.memory.list('fact', 40);
    const lines: string[] = [];
    for (const entry of preferences) {
      lines.push(`- Präferenz${entry.key ? ` (${entry.key})` : ''}: ${entry.value}`);
    }
    for (const entry of facts) {
      lines.push(`- Fakt${entry.key ? ` (${entry.key})` : ''}: ${entry.value}`);
    }
    return lines.join('\n');
  }
}
