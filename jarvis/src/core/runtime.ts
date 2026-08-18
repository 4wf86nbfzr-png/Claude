import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { JarvisEvent, JarvisError, Result } from '../shared/types.js';
import { openDatabase, type Database } from './db/database.js';
import { migrate } from './db/migrate.js';
import { CompanyRepository } from './db/repositories/companies.js';
import { EmailRepository } from './db/repositories/emails.js';
import {
  AuditRepository,
  CampaignRepository,
  ConversationRepository,
  KeyValueRepository,
  MemoryRepository,
  TaskRepository,
} from './db/repositories/misc.js';
import { ApprovalRepository } from './db/repositories/approvals.js';
import { CredentialService, type SecretBox } from './services/CredentialService.js';
import { SettingsService } from './services/SettingsService.js';
import { AuditLogService } from './services/AuditLogService.js';
import { ApprovalService } from './services/ApprovalService.js';
import { ComplianceService } from './services/ComplianceService.js';
import { MemoryService } from './services/MemoryService.js';
import { MailAgent } from './agents/MailAgent.js';
import { CompanyResearchAgent } from './agents/CompanyResearchAgent.js';
import { OutreachAgent } from './agents/OutreachAgent.js';
import { BrowserAgent } from './agents/BrowserAgent.js';
import { FileAgent } from './agents/FileAgent.js';
import { CalendarAgent } from './agents/CalendarAgent.js';
import { SystemAgent, type SystemBridge } from './agents/SystemAgent.js';
import { VoiceAgent } from './agents/VoiceAgent.js';
import { buildToolRegistry } from './tools/index.js';
import type { ToolContext } from './tools/context.js';
import { createLlmProvider } from './llm/factory.js';
import type { LlmProvider } from './llm/types.js';
import type { MailReader, MailTransport } from './mail/types.js';
import { JarvisCore } from './JarvisCore.js';

export interface RuntimeOptions {
  /** Directory for the database, the credential seed and the workspace. */
  dataDir: string;
  secretBox: SecretBox;
  systemBridge: SystemBridge;
  /** Pushes runtime events towards the UI. */
  emit: (event: JarvisEvent) => void;
  /** Overrides the database file; `:memory:` is used by the tests. */
  databaseFile?: string;
  /**
   * Test seams. Production passes none of these and gets the real providers,
   * so there is no way to accidentally ship a stubbed transport.
   */
  overrides?: {
    mailTransport?: () => Result<MailTransport, JarvisError>;
    mailReader?: () => Result<MailReader, JarvisError>;
    llm?: () => Result<LlmProvider, JarvisError>;
  };
}

export interface JarvisRuntime {
  db: Database;
  dataDir: string;
  workspaceDir: string;
  repos: {
    companies: CompanyRepository;
    emails: EmailRepository;
    campaigns: CampaignRepository;
    tasks: TaskRepository;
    approvals: ApprovalRepository;
    audit: AuditRepository;
    memory: MemoryRepository;
    conversations: ConversationRepository;
    kv: KeyValueRepository;
  };
  services: {
    settings: SettingsService;
    credentials: CredentialService;
    audit: AuditLogService;
    approvals: ApprovalService;
    compliance: ComplianceService;
    memory: MemoryService;
  };
  agents: {
    mail: MailAgent;
    research: CompanyResearchAgent;
    outreach: OutreachAgent;
    browser: BrowserAgent;
    file: FileAgent;
    calendar: CalendarAgent;
    system: SystemAgent;
    voice: VoiceAgent;
  };
  core: JarvisCore;
  llm(): Result<LlmProvider, JarvisError>;
  /** Pushes an event to the UI; used by IPC handlers that report progress. */
  emit(event: JarvisEvent): void;
  close(): void;
}

/**
 * Wires the whole application together.
 *
 * Everything the core needs from the outside — the OS, the secret box, the
 * event sink — arrives as a parameter, which is what lets the test suite build
 * a complete runtime against an in-memory database with no Electron present.
 */
export function createRuntime(options: RuntimeOptions): JarvisRuntime {
  mkdirSync(options.dataDir, { recursive: true });
  const workspaceDir = join(options.dataDir, 'workspace');
  mkdirSync(workspaceDir, { recursive: true });

  const db = openDatabase(options.databaseFile ?? join(options.dataDir, 'jarvis.db'));
  migrate(db);

  const repos = {
    companies: new CompanyRepository(db),
    emails: new EmailRepository(db),
    campaigns: new CampaignRepository(db),
    tasks: new TaskRepository(db),
    approvals: new ApprovalRepository(db),
    audit: new AuditRepository(db),
    memory: new MemoryRepository(db),
    conversations: new ConversationRepository(db),
    kv: new KeyValueRepository(db),
  };

  const settings = new SettingsService(repos.kv);
  const credentials = new CredentialService(db, options.secretBox);
  const audit = new AuditLogService(repos.audit, credentials);
  const approvals = new ApprovalService(repos.approvals, audit);
  const compliance = new ComplianceService(repos.companies, repos.emails);
  const memory = new MemoryService(repos.memory, repos.conversations);

  audit.onEntry((entry) => options.emit({ type: 'audit', entry }));
  approvals.onChange((request, phase) =>
    options.emit(
      phase === 'requested'
        ? { type: 'approval-requested', request }
        : { type: 'approval-resolved', request },
    ),
  );

  const llm = (): Result<LlmProvider, JarvisError> =>
    options.overrides?.llm
      ? options.overrides.llm()
      : createLlmProvider(settings.get().llm, credentials);

  const system = new SystemAgent({ bridge: options.systemBridge, audit });
  const mail = new MailAgent({
    emails: repos.emails,
    companies: repos.companies,
    approvals,
    audit,
    compliance,
    settings,
    credentials,
    ...(options.overrides?.mailTransport ? { transportFactory: options.overrides.mailTransport } : {}),
    ...(options.overrides?.mailReader ? { readerFactory: options.overrides.mailReader } : {}),
  });
  const research = new CompanyResearchAgent({
    companies: repos.companies,
    settings,
    credentials,
    audit,
    llm,
  });
  const outreach = new OutreachAgent({
    companies: repos.companies,
    emails: repos.emails,
    campaigns: repos.campaigns,
    mail,
    research,
    compliance,
    settings,
    audit,
    llm,
  });
  const browser = new BrowserAgent({ settings, audit, system });
  const file = new FileAgent({ settings, approvals, audit, workspaceDir });
  const calendar = new CalendarAgent({ settings, tasks: repos.tasks });
  const voice = new VoiceAgent({ settings, credentials });

  const agents = { mail, research, outreach, browser, file, calendar, system, voice };
  const services = { settings, credentials, audit, approvals, compliance, memory };

  const registry = buildToolRegistry();

  const toolContext = (
    conversationId: string,
    signal: AbortSignal,
    status: (message: string) => void,
  ): ToolContext => ({
    agents,
    services: { approvals, audit, memory, compliance, settings, credentials },
    repos: {
      companies: repos.companies,
      emails: repos.emails,
      campaigns: repos.campaigns,
      tasks: repos.tasks,
    },
    status,
    conversationId,
    signal,
  });

  const core = new JarvisCore({
    registry,
    toolContext,
    llm,
    memory,
    approvals,
    audit,
    settings,
    emit: options.emit,
  });

  memory.housekeeping();

  return {
    db,
    dataDir: options.dataDir,
    workspaceDir,
    repos,
    services,
    agents,
    core,
    llm,
    emit: options.emit,
    close(): void {
      db.close();
    },
  };
}
