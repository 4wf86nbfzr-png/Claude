/**
 * Re-exports the shared domain types under a single import path for the
 * repositories, plus the raw row shapes that only the data layer needs.
 */
export type {
  ApprovalAction,
  ApprovalRequest,
  ApprovalStatus,
  AuditEntry,
  CampaignRecord,
  ChatMessage,
  CompanyDossier,
  CompanyRecord,
  CompanyStatus,
  ContactRecord,
  EmailAddressRecord,
  EmailAttachment,
  EmailRecord,
  EmailStatus,
  MemoryEntry,
  MemoryKind,
  SourceRef,
  VerificationStatus,
} from '../../../shared/types.js';

/** Raw shape returned by the send-desk query before it is mapped to the UI row. */
export interface SendDeskFilterRow {
  company_id: number;
  company: string;
  company_status: string;
  rationale: string | null;
  last_contact_at: string | null;
  do_not_contact: number;
  contact: string | null;
  email: string | null;
  email_status: string | null;
  source: string | null;
  email_id: number | null;
  mail_status: string | null;
  approval_status: string | null;
}
