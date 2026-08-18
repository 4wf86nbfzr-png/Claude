/**
 * @jarvis/core -- Agenten, Werkzeuge, Datenbank, Mail, Recherche, Freigaben.
 *
 * Der Kern kennt weder Electron noch React. Er laesst sich in der Desktop-App,
 * in der CLI und in Tests gleichermassen benutzen.
 */

export { Jarvis } from './jarvis.js';
export type { CreateJarvisOptions, ApprovalUtterance } from './jarvis.js';

export * from './context.js';
export * from './config/env.js';
export * from './config/paths.js';

export * from './db/database.js';
export * from './db/schema.js';
export * from './db/repos/index.js';

export * from './services/approval.js';
export * from './services/audit.js';
export * from './services/credentials.js';
export * from './services/events.js';
export * from './services/memory.js';

export * from './compliance/guard.js';
export * from './llm/index.js';
export * from './mail/index.js';
export * from './research/index.js';
export * from './outreach/service.js';
export * from './system/index.js';
export * from './calendar/index.js';
export * from './voice/index.js';
export * from './tools/index.js';
export * from './agents/index.js';

export * from './ipc/contract.js';
export { CommandHandler } from './ipc/handler.js';

export * from './util/result.js';
export * from './util/logger.js';
export * from './util/text.js';
