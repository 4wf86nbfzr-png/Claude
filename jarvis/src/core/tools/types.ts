import type { z } from 'zod';
import type { Repositories } from '../db/repositories';
import type { JarvisConfig } from '../services/config';
import type { CredentialService } from '../services/credentials';
import type { AuditLogService } from '../services/audit';
import type { ApprovalService } from '../services/approval';
import type { EventBus } from '../services/events';
import type { LlmProvider } from '../services/llm';
import type { MailService } from '../services/mail';
import type { ResearchService } from '../research';
import type { SystemService } from '../services/system';

/** Alles, worauf ein Werkzeug zugreifen darf. Mehr gibt es nicht. */
export interface ToolContext {
  repos: Repositories;
  config: JarvisConfig;
  credentials: CredentialService;
  audit: AuditLogService;
  approvals: ApprovalService;
  bus: EventBus;
  llm: LlmProvider;
  mail: MailService;
  research: ResearchService;
  system: SystemService;
  sessionId: string;
}

/**
 * Ergebnis eines Werkzeugs.
 *
 * `summary` ist der Satz, den JARVIS notfalls vorlesen kann; `data` geht an
 * das Sprachmodell zurück. Fehler werden als `ok: false` gemeldet und nie
 * als Erfolg verkleidet (§19).
 */
export interface ToolResult<T = unknown> {
  ok: boolean;
  summary: string;
  data?: T;
  error?: string;
  approvalId?: number;
}

export const ok = <T>(summary: string, data?: T, extra: Partial<ToolResult<T>> = {}): ToolResult<T> => ({
  ok: true,
  summary,
  ...(data !== undefined ? { data } : {}),
  ...extra
});

export const fail = (error: string, extra: Partial<ToolResult> = {}): ToolResult => ({
  ok: false,
  summary: error,
  error,
  ...extra
});

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  /** Für das Sprachmodell: was das Werkzeug tut und wann man es nimmt. */
  description: string;
  schema: S;
  /** Zuständiger Agent – nur für Protokoll und Oberfläche. */
  agent: string;
  /**
   * Gesetzt, wenn die Aktion freigabepflichtig ist (§11). Die Registry
   * verlangt dann eine gültige, inhaltlich passende Freigabe.
   */
  criticalAction?: string;
  /**
   * Prüfsumme, an die die Freigabe gebunden ist. Ohne eigene Implementierung
   * wird die Prüfsumme der Eingabeparameter benutzt.
   */
  contentHash?: (input: z.infer<S>, context: ToolContext) => string | Promise<string>;
  execute: (input: z.infer<S>, context: ToolContext) => Promise<ToolResult>;
}
