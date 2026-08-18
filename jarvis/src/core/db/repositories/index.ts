import { Db } from '../database';
import { ApprovalRepo } from './approvals';
import { AuditRepo } from './audit';
import { CampaignRepo } from './campaigns';
import { CompanyRepo } from './companies';
import { ContactRepo, EmailAddressRepo } from './contacts';
import { EmailRepo } from './emails';
import { InteractionRepo } from './interactions';
import { ConversationRepo, MemoryRepo, SettingsRepo } from './memory';
import { SourceRepo } from './sources';
import { SuppressionRepo } from './suppression';
import { TaskRepo } from './tasks';

export * from './approvals';
export * from './audit';
export * from './campaigns';
export * from './companies';
export * from './contacts';
export * from './emails';
export * from './interactions';
export * from './memory';
export * from './sources';
export * from './suppression';
export * from './tasks';

/** Ein Bündel aller Repositories über derselben Datenbankverbindung. */
export interface Repositories {
  db: Db;
  approvals: ApprovalRepo;
  audit: AuditRepo;
  campaigns: CampaignRepo;
  companies: CompanyRepo;
  contacts: ContactRepo;
  addresses: EmailAddressRepo;
  emails: EmailRepo;
  interactions: InteractionRepo;
  memory: MemoryRepo;
  conversation: ConversationRepo;
  settings: SettingsRepo;
  sources: SourceRepo;
  suppression: SuppressionRepo;
  tasks: TaskRepo;
}

export function createRepositories(db: Db): Repositories {
  return {
    db,
    approvals: new ApprovalRepo(db),
    audit: new AuditRepo(db),
    campaigns: new CampaignRepo(db),
    companies: new CompanyRepo(db),
    contacts: new ContactRepo(db),
    addresses: new EmailAddressRepo(db),
    emails: new EmailRepo(db),
    interactions: new InteractionRepo(db),
    memory: new MemoryRepo(db),
    conversation: new ConversationRepo(db),
    settings: new SettingsRepo(db),
    sources: new SourceRepo(db),
    suppression: new SuppressionRepo(db),
    tasks: new TaskRepo(db)
  };
}
