import type { BrowserAgent } from '../agents/BrowserAgent.js';
import type { CalendarAgent } from '../agents/CalendarAgent.js';
import type { CompanyResearchAgent } from '../agents/CompanyResearchAgent.js';
import type { FileAgent } from '../agents/FileAgent.js';
import type { MailAgent } from '../agents/MailAgent.js';
import type { OutreachAgent } from '../agents/OutreachAgent.js';
import type { SystemAgent } from '../agents/SystemAgent.js';
import type { VoiceAgent } from '../agents/VoiceAgent.js';
import type { CompanyRepository } from '../db/repositories/companies.js';
import type { EmailRepository } from '../db/repositories/emails.js';
import type { CampaignRepository, TaskRepository } from '../db/repositories/misc.js';
import type { ApprovalService } from '../services/ApprovalService.js';
import type { AuditLogService } from '../services/AuditLogService.js';
import type { ComplianceService } from '../services/ComplianceService.js';
import type { CredentialService } from '../services/CredentialService.js';
import type { MemoryService } from '../services/MemoryService.js';
import type { SettingsService } from '../services/SettingsService.js';

/** Everything a tool may reach. Nothing else is in scope for a tool. */
export interface ToolContext {
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
  services: {
    approvals: ApprovalService;
    audit: AuditLogService;
    memory: MemoryService;
    compliance: ComplianceService;
    settings: SettingsService;
    credentials: CredentialService;
  };
  repos: {
    companies: CompanyRepository;
    emails: EmailRepository;
    campaigns: CampaignRepository;
    tasks: TaskRepository;
  };
  /** Emits a spoken/visible progress line during long tools (§7). */
  status(message: string): void;
  conversationId: string;
  signal?: AbortSignal;
}
