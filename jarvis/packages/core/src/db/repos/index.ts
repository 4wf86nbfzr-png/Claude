import type { Db } from '../database.js';
import { ApprovalRepo } from './approvals.js';
import { CampaignRepo } from './campaigns.js';
import { CompanyRepo } from './companies.js';
import { EmailRepo } from './emails.js';
import { AuditRepo, ConversationRepo, MemoryRepo, SettingsRepo, SuppressionRepo, TaskRepo } from './misc.js';

export * from './approvals.js';
export * from './campaigns.js';
export * from './companies.js';
export * from './emails.js';
export * from './misc.js';

/** Buendel aller Repositories -- wird einmal beim Start erzeugt. */
export interface Repositories {
  db: Db;
  companies: CompanyRepo;
  emails: EmailRepo;
  campaigns: CampaignRepo;
  approvals: ApprovalRepo;
  audit: AuditRepo;
  settings: SettingsRepo;
  suppression: SuppressionRepo;
  tasks: TaskRepo;
  memory: MemoryRepo;
  conversations: ConversationRepo;
}

export function createRepositories(db: Db): Repositories {
  return {
    db,
    companies: new CompanyRepo(db),
    emails: new EmailRepo(db),
    campaigns: new CampaignRepo(db),
    approvals: new ApprovalRepo(db),
    audit: new AuditRepo(db),
    settings: new SettingsRepo(db),
    suppression: new SuppressionRepo(db),
    tasks: new TaskRepo(db),
    memory: new MemoryRepo(db),
    conversations: new ConversationRepo(db),
  };
}
