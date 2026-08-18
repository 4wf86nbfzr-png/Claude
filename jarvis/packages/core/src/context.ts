import type { JarvisEnv } from './config/env.js';
import type { JarvisPaths } from './config/paths.js';
import type { Repositories } from './db/repos/index.js';
import type { ComplianceGuard } from './compliance/guard.js';
import type { LlmProvider } from './llm/types.js';
import type { MailService } from './mail/service.js';
import type { MailReader } from './mail/types.js';
import type { OutreachService } from './outreach/service.js';
import type { ResearchService } from './research/service.js';
import type { ApprovalService } from './services/approval.js';
import type { AuditLogService } from './services/audit.js';
import type { CredentialService } from './services/credentials.js';
import type { EventBus } from './services/events.js';
import type { MemoryService } from './services/memory.js';
import type { ToolRegistry } from './tools/types.js';
import type { VoiceService } from './voice/index.js';
import type { Logger } from './util/logger.js';
import type { SystemService } from './system/index.js';
import type { CalendarSource } from './calendar/index.js';

/**
 * Alles, was ein Tool oder Agent zur Ausfuehrung braucht.
 *
 * Bewusst ein einfaches Objekt statt eines DI-Containers: man sieht auf einen
 * Blick, worauf ein Tool zugreifen kann, und in Tests baut man es von Hand.
 */
export interface JarvisContext {
  env: JarvisEnv;
  paths: JarvisPaths;
  logger: Logger;
  bus: EventBus;

  repos: Repositories;
  audit: AuditLogService;
  approvals: ApprovalService;
  memory: MemoryService;
  credentials: CredentialService;
  compliance: ComplianceGuard;

  llm: LlmProvider;
  mail: MailService;
  mailReader: MailReader | null;
  research: ResearchService;
  outreach: OutreachService;
  voice: VoiceService;
  system: SystemService;
  calendar: CalendarSource;
  registry: ToolRegistry;

  /** Wer hat den laufenden Auftrag ausgeloest. */
  actor: string;
  /** Welcher Agent arbeitet gerade -- steht so im Audit-Log. */
  agent: string;
  conversationId: string | null;
  signal?: AbortSignal | undefined;

  /** Kopie des Kontexts mit anderem Agentennamen (fuer Unteragenten). */
  withAgent(agent: string): JarvisContext;
}

export function withAgentName(ctx: JarvisContext, agent: string): JarvisContext {
  return { ...ctx, agent, withAgent: (a: string) => withAgentName(ctx, a) };
}
