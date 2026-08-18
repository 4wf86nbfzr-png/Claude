import type {
  ApprovalStatus,
  ClaimKind,
  EmailStatus,
  OutreachStatus,
  VerificationStatus,
  VoiceState
} from './status';

export interface Source {
  id: number;
  url: string;
  kind: 'website' | 'kontakt' | 'impressum' | 'suche' | 'verzeichnis' | 'sonstige';
  title: string | null;
  httpStatus: number | null;
  excerpt: string | null;
  fetchedAt: string;
}

export interface Company {
  id: number;
  name: string;
  normalizedName: string;
  website: string | null;
  domain: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  industry: string | null;
  sizeHint: string | null;
  description: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: number;
  companyId: number;
  fullName: string;
  role: string | null;
  phone: string | null;
  sourceId: number | null;
  createdAt: string;
}

export interface EmailAddress {
  id: number;
  companyId: number;
  contactId: number | null;
  address: string;
  verificationStatus: VerificationStatus;
  verificationMethod: string;
  evidenceUrl: string | null;
  evidenceSnippet: string | null;
  sourceId: number | null;
  firstSeenAt: string;
  lastCheckedAt: string | null;
}

/** Eine belegte Aussage oder eine als solche gekennzeichnete Einschätzung. */
export interface CompanyClaim {
  id: number;
  companyId: number;
  kind: ClaimKind;
  statement: string;
  sourceId: number | null;
  sourceUrl: string | null;
  createdAt: string;
}

export interface Campaign {
  id: number;
  name: string;
  service: string;
  region: string | null;
  radiusKm: number | null;
  targetCount: number | null;
  goal: string | null;
  status: 'AKTIV' | 'PAUSIERT' | 'ABGESCHLOSSEN';
  createdAt: string;
  updatedAt: string;
}

export interface EmailAttachment {
  filename: string;
  path: string;
  contentType?: string;
  size?: number;
}

export interface EmailRecord {
  id: number;
  campaignId: number | null;
  companyId: number | null;
  contactId: number | null;
  direction: 'AUSGEHEND' | 'EINGEHEND';
  fromAddress: string | null;
  toAddresses: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  attachments: EmailAttachment[];
  status: EmailStatus;
  contentHash: string;
  approvalId: number | null;
  messageId: string | null;
  inReplyTo: string | null;
  threadKey: string | null;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: number;
  action: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  contentHash: string;
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  note: string | null;
  expiresAt: string | null;
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: 'BENUTZER' | 'JARVIS' | 'SYSTEM';
  agent: string | null;
  action: string;
  target: string | null;
  status: 'OK' | 'FEHLER' | 'INFO' | 'ABGELEHNT';
  detail: Record<string, unknown> | null;
}

export interface TaskRecord {
  id: number;
  title: string;
  detail: string | null;
  status: 'OFFEN' | 'LAEUFT' | 'ERLEDIGT' | 'ABGEBROCHEN';
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryItem {
  id: number;
  scope: 'praeferenz' | 'firmenwissen' | 'notiz' | 'gespraech';
  key: string;
  value: string;
  importance: number;
  createdAt: string;
  updatedAt: string;
}

export interface SuppressionEntry {
  id: number;
  patternType: 'domain' | 'adresse';
  value: string;
  reason: string | null;
  createdAt: string;
}

/** Eine Zeile der Versandzentrale (§6). */
export interface OutreachRow {
  id: number;
  campaignId: number;
  campaignName: string;
  companyId: number;
  company: string;
  contactName: string | null;
  contactRole: string | null;
  email: string | null;
  verification: VerificationStatus | null;
  sourceUrl: string | null;
  reason: string | null;
  status: OutreachStatus;
  emailId: number | null;
  emailStatus: EmailStatus | null;
  approvalId: number | null;
  approvalStatus: ApprovalStatus | null;
  lastContactAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  agent?: string;
  toolName?: string;
  createdAt: string;
  /** Nur gesetzt, wenn die Nachricht eine Freigabe anfordert. */
  approvalId?: number;
}

export interface AgentEvent {
  kind: 'state' | 'message' | 'tool' | 'approval' | 'progress' | 'error' | 'speak';
  state?: VoiceState;
  message?: ChatMessage;
  toolName?: string;
  toolStatus?: 'start' | 'ok' | 'fehler';
  approvalId?: number;
  text?: string;
  detail?: unknown;
}

export interface ProviderHealth {
  id: string;
  label: string;
  configured: boolean;
  hint: string;
}

export interface SystemStatus {
  llm: ProviderHealth[];
  stt: ProviderHealth[];
  tts: ProviderHealth[];
  search: ProviderHealth[];
  mail: ProviderHealth[];
  dbPath: string;
  dryRun: boolean;
  dailySendLimit: number;
  sentToday: number;
}
