/**
 * Domain types shared between the Electron main process (agent runtime) and the
 * renderer (UI). Everything crossing the IPC bridge must be structured-clonable
 * — plain objects, no class instances, no functions.
 */

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

/**
 * Every tool and every fallible service call returns a Result instead of
 * throwing. Rule 19 of the specification: JARVIS must never claim success it
 * cannot prove, so failures are values that travel all the way to the UI.
 */
export type Result<T, E = JarvisError> = { ok: true; value: T } | { ok: false; error: E };

export interface JarvisError {
  /** Stable, machine-readable identifier, e.g. `mail.smtp_rejected`. */
  code: string;
  /** German, user-facing description of what went wrong. */
  message: string;
  /** Concrete next step the user can take, when one exists. */
  hint?: string;
  /** Raw provider payload, truncated. Never contains credentials. */
  detail?: string;
  retryable?: boolean;
}

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E = JarvisError>(error: E): Result<never, E> => ({ ok: false, error });

export function makeError(
  code: string,
  message: string,
  extra: Omit<JarvisError, 'code' | 'message'> = {},
): JarvisError {
  return { code, message, ...extra };
}

/* ------------------------------------------------------------------ */
/* Assistant / voice state                                             */
/* ------------------------------------------------------------------ */

export type AssistantState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'WAITING FOR APPROVAL'
  | 'ERROR';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  /** Tool activity attached to an assistant turn, for the transcript view. */
  toolCalls?: ToolCallRecord[];
  /** True when the text was produced from a voice transcript. */
  spoken?: boolean;
}

export interface ToolCallRecord {
  id: string;
  tool: string;
  agent: string;
  input: unknown;
  status: 'running' | 'ok' | 'error' | 'awaiting-approval' | 'denied';
  summary: string;
  startedAt: string;
  finishedAt?: string;
  error?: JarvisError;
}

/* ------------------------------------------------------------------ */
/* Companies, contacts, e-mail addresses                               */
/* ------------------------------------------------------------------ */

/**
 * Confidence in a business e-mail address.
 *
 * - `VERIFIZIERT`      – literally read from an official company page
 *                        (website, Kontakt, Impressum) and syntactically and
 *                        DNS-wise plausible.
 * - `WAHRSCHEINLICH`   – found on a third-party but reputable source, or the
 *                        domain does not match the company website.
 * - `NICHT_VERIFIZIERT`– anything else. Never used for sending.
 *
 * Guessed patterns (vorname.nachname@firma.de) are never produced at all.
 */
export type VerificationStatus = 'VERIFIZIERT' | 'WAHRSCHEINLICH' | 'NICHT_VERIFIZIERT';

export type EmailAddressKind = 'general' | 'person' | 'department';

export interface SourceRef {
  id?: number;
  url: string;
  /** `website` | `kontakt` | `impressum` | `suchmaschine` | `manuell` … */
  kind: string;
  title?: string;
  /** ISO timestamp of when the page was retrieved. */
  retrievedAt: string;
  /** Verbatim snippet the datum was read from. Evidence, not paraphrase. */
  excerpt?: string;
}

export interface EmailAddressRecord {
  id: number;
  companyId: number;
  contactId?: number | null;
  address: string;
  kind: EmailAddressKind;
  status: VerificationStatus;
  /** Why the address carries this status — shown in the UI verbatim. */
  reason: string;
  sourceUrl?: string | null;
  foundAt: string;
  mxChecked: boolean;
  mxOk: boolean | null;
}

export interface ContactRecord {
  id: number;
  companyId: number;
  fullName: string;
  role?: string | null;
  phone?: string | null;
  sourceUrl?: string | null;
  createdAt: string;
}

export type CompanyStatus =
  | 'Neu'
  | 'Recherche läuft'
  | 'Kontakt gefunden'
  | 'Entwurf erstellt'
  | 'Wartet auf Freigabe'
  | 'Freigegeben'
  | 'Gesendet'
  | 'Fehler'
  | 'Antwort erhalten';

export interface CompanyRecord {
  id: number;
  name: string;
  website?: string | null;
  domain?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  industry?: string | null;
  /** Facts only, each backed by a source. */
  description?: string | null;
  phone?: string | null;
  contactPageUrl?: string | null;
  imprintUrl?: string | null;
  status: CompanyStatus;
  /** AI assessment — explicitly separated from facts (specification §15). */
  outreachRationale?: string | null;
  doNotContact: boolean;
  doNotContactReason?: string | null;
  lastContactAt?: string | null;
  createdAt: string;
  updatedAt: string;
  researchedAt?: string | null;
}

/** A company plus everything the UI needs to render one row of the send desk. */
export interface CompanyDossier {
  company: CompanyRecord;
  contacts: ContactRecord[];
  emails: EmailAddressRecord[];
  sources: SourceRef[];
  /** Newest draft or sent mail for this company, if any. */
  latestEmail?: EmailRecord | null;
}

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

export interface CampaignRecord {
  id: number;
  name: string;
  /** The service being offered, e.g. "24/7 Baustellenbewachung". */
  service: string;
  region?: string | null;
  /** Target number of qualified companies. */
  targetCount: number;
  /** Free-form notes that flow into the draft prompt. */
  notes?: string | null;
  status: 'aktiv' | 'pausiert' | 'abgeschlossen';
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* E-mail                                                              */
/* ------------------------------------------------------------------ */

export type EmailStatus =
  | 'entwurf'
  | 'wartet_auf_freigabe'
  | 'freigegeben'
  | 'gesendet'
  | 'fehlgeschlagen'
  | 'abgebrochen';

export interface EmailAttachment {
  filename: string;
  /** Absolute path on disk. Content is read at send time, not stored in the DB. */
  path: string;
  size?: number;
  contentType?: string;
}

export interface EmailRecord {
  id: number;
  companyId?: number | null;
  contactId?: number | null;
  campaignId?: number | null;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachments: EmailAttachment[];
  status: EmailStatus;
  /** Set once a human approved this exact revision. */
  approvalId?: number | null;
  /** Incremented on every edit; approval is bound to a revision. */
  revision: number;
  /** Message-Id returned by the transport. Proof of an actual send. */
  messageId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt?: string | null;
  /** Set when a reply has been matched back to this thread. */
  repliedAt?: string | null;
}

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

export type ApprovalAction =
  | 'email.send'
  | 'email.send_bulk'
  | 'file.delete'
  | 'file.overwrite'
  | 'app.install'
  | 'system.settings'
  | 'payment'
  | 'account.modify'
  | 'data.publish'
  | 'form.submit'
  | 'message.external';

export type ApprovalStatus = 'offen' | 'freigegeben' | 'abgelehnt' | 'abgelaufen';

export interface ApprovalRequest {
  id: number;
  action: ApprovalAction;
  /** One-line summary shown in the approval banner. */
  title: string;
  /** Key/value pairs rendered as the approval detail table. */
  facts: Array<{ label: string; value: string }>;
  /** Full text that must be read aloud / displayed before approval. */
  preview?: string;
  /** Identifier of the object being approved, e.g. `email:17`. */
  subject: string;
  /** Revision fingerprint. An edit after approval invalidates it. */
  fingerprint: string;
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
  /** Verbatim user utterance or button that granted the approval. */
  decisionEvidence?: string | null;
  expiresAt: string;
}

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

export interface AuditEntry {
  id: number;
  at: string;
  actor: 'benutzer' | 'jarvis' | 'system';
  agent?: string | null;
  action: string;
  subject?: string | null;
  outcome: 'ok' | 'fehler' | 'abgelehnt' | 'info';
  detail?: string | null;
}

/* ------------------------------------------------------------------ */
/* Memory                                                              */
/* ------------------------------------------------------------------ */

export type MemoryKind =
  | 'conversation'
  | 'preference'
  | 'fact'
  | 'task'
  | 'note';

export interface MemoryEntry {
  id: number;
  kind: MemoryKind;
  key?: string | null;
  value: string;
  /** Optional link to a company/campaign so it can be deleted with it. */
  scope?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Null = keep indefinitely. Conversation memory defaults to 30 days. */
  expiresAt?: string | null;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface SenderIdentity {
  name: string;
  email: string;
  replyTo?: string;
  signature?: string;
}

export interface ComplianceSettings {
  /** Hard cap on sends per rolling 24 h. */
  dailySendLimit: number;
  /** Minimum seconds between two sends. */
  minSecondsBetweenSends: number;
  /** Refuse a second first-contact within this many days. */
  reContactBlockDays: number;
  /** Only VERIFIZIERT addresses may be sent to when true. */
  requireVerifiedAddress: boolean;
}

export interface LlmSettings {
  provider: 'anthropic' | 'openai' | 'ollama';
  model: string;
  /** Anthropic effort level; ignored by other providers. */
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxTokens: number;
  /** Base URL override, used by openai-compatible and ollama providers. */
  baseUrl?: string;
}

export interface VoiceSettings {
  sttProvider: 'webspeech' | 'openai' | 'off';
  ttsProvider: 'webspeech' | 'openai' | 'elevenlabs' | 'off';
  language: string;
  /** Provider-specific voice identifier. */
  voice?: string;
  /** Wake word handled in the renderer. Empty string disables it. */
  wakeWord: string;
}

export interface MailAccountSettings {
  transport: 'smtp' | 'gmail' | 'graph' | 'none';
  identity: SenderIdentity;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
  };
  imap?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    mailbox: string;
  };
  gmail?: {
    clientId: string;
    /** Redirect URI registered with Google; loopback by default. */
    redirectUri: string;
  };
}

export interface ResearchSettings {
  searchProvider: 'brave' | 'tavily' | 'serpapi' | 'duckduckgo';
  /** Politeness delay between two HTTP requests to the same host, in ms. */
  crawlDelayMs: number;
  maxPagesPerCompany: number;
  respectRobotsTxt: boolean;
  userAgent: string;
}

export interface IntegrationSettings {
  /** Read-only ICS feeds (webcal/https URL or local .ics path) for the calendar. */
  calendarIcsSources: string[];
  /**
   * Directories the FileAgent may touch. Least privilege (§12): everything
   * outside these roots is refused, including for reads.
   */
  fileRoots: string[];
}

export interface AppSettings {
  llm: LlmSettings;
  voice: VoiceSettings;
  mail: MailAccountSettings;
  research: ResearchSettings;
  compliance: ComplianceSettings;
  integrations: IntegrationSettings;
  /** Free-form context about the user's own company, injected into prompts. */
  company: {
    name: string;
    services: string;
    pitch: string;
    website: string;
    phone: string;
    address: string;
  };
  setupCompleted: boolean;
}

/* ------------------------------------------------------------------ */
/* Credentials                                                         */
/* ------------------------------------------------------------------ */

/** Names of secrets the credential store knows about. Values are never typed. */
export type CredentialKey =
  | 'anthropic.apiKey'
  | 'openai.apiKey'
  | 'elevenlabs.apiKey'
  | 'brave.apiKey'
  | 'tavily.apiKey'
  | 'serpapi.apiKey'
  | 'smtp.password'
  | 'imap.password'
  | 'gmail.clientSecret'
  | 'gmail.refreshToken';

export interface CredentialStatus {
  key: CredentialKey;
  present: boolean;
  /** Where the value came from: the encrypted store or the environment. */
  origin: 'store' | 'env' | 'none';
  /** Last four characters only, for recognition. Never the full secret. */
  hint?: string;
}

/* ------------------------------------------------------------------ */
/* Runtime events pushed from main to renderer                         */
/* ------------------------------------------------------------------ */

export type JarvisEvent =
  | { type: 'state'; state: AssistantState }
  | { type: 'message'; message: ChatMessage }
  | { type: 'message-delta'; messageId: string; delta: string }
  | { type: 'tool'; call: ToolCallRecord }
  | { type: 'status'; text: string }
  | { type: 'speak'; text: string; messageId?: string }
  | { type: 'approval-requested'; request: ApprovalRequest }
  | { type: 'approval-resolved'; request: ApprovalRequest }
  | { type: 'companies-changed' }
  | { type: 'emails-changed' }
  | { type: 'audit'; entry: AuditEntry }
  | { type: 'error'; error: JarvisError };

/* ------------------------------------------------------------------ */
/* Send desk                                                           */
/* ------------------------------------------------------------------ */

/** One row of the Versandzentrale (specification §6). */
export interface SendDeskRow {
  companyId: number;
  company: string;
  contact: string | null;
  email: string | null;
  emailStatus: VerificationStatus | null;
  source: string | null;
  rationale: string | null;
  mailStatus: EmailStatus | 'kein_entwurf';
  lastContactAt: string | null;
  approvalStatus: ApprovalStatus | 'keine';
  emailId: number | null;
  status: CompanyStatus;
  doNotContact: boolean;
}
