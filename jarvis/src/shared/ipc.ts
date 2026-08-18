/**
 * The complete IPC surface between renderer and main process.
 *
 * Security model: the renderer has no Node integration and no direct access to
 * `ipcRenderer`. The preload script exposes exactly the methods below through
 * `contextBridge`, and the main process registers a handler for exactly these
 * channel names — anything else is rejected. Adding a capability means adding
 * it here, deliberately.
 */
import type {
  AppSettings,
  ApprovalRequest,
  AuditEntry,
  CampaignRecord,
  ChatMessage,
  CompanyDossier,
  CredentialKey,
  CredentialStatus,
  EmailRecord,
  JarvisEvent,
  MemoryEntry,
  Result,
  SendDeskRow,
} from './types.js';

export interface ChatSendPayload {
  text: string;
  conversationId?: string;
  /** True when this came from speech recognition rather than the keyboard. */
  spoken?: boolean;
}

export interface DraftPatch {
  to?: string;
  subject?: string;
  body?: string;
  cc?: string[];
  bcc?: string[];
}

export interface ResearchRequest {
  query: string;
  region?: string;
  limit: number;
  campaignId?: number;
}

export interface OutreachRequest {
  campaignId: number;
  companyIds: number[];
}

export interface SendDeskFilter {
  campaignId?: number;
  mailStatus?: string;
  onlyReadyForApproval?: boolean;
  search?: string;
}

/**
 * `JarvisApi` is what `window.jarvis` provides in the renderer.
 * Every method is asynchronous and returns a `Result` where it can fail.
 */
export interface JarvisApi {
  chat: {
    send(payload: ChatSendPayload): Promise<Result<ChatMessage>>;
    history(conversationId: string, limit?: number): Promise<ChatMessage[]>;
    newConversation(): Promise<string>;
    cancel(): Promise<void>;
  };
  approvals: {
    list(): Promise<ApprovalRequest[]>;
    /** `evidence` records how the approval was given (button label or utterance). */
    approve(id: number, evidence: string): Promise<Result<ApprovalRequest>>;
    reject(id: number, evidence: string): Promise<Result<ApprovalRequest>>;
  };
  companies: {
    sendDesk(filter?: SendDeskFilter): Promise<SendDeskRow[]>;
    dossier(companyId: number): Promise<Result<CompanyDossier>>;
    setDoNotContact(companyId: number, value: boolean, reason?: string): Promise<Result<true>>;
    remove(companyId: number): Promise<Result<true>>;
  };
  campaigns: {
    list(): Promise<CampaignRecord[]>;
    create(input: Omit<CampaignRecord, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<Result<CampaignRecord>>;
    update(id: number, patch: Partial<CampaignRecord>): Promise<Result<CampaignRecord>>;
    remove(id: number): Promise<Result<true>>;
  };
  research: {
    run(request: ResearchRequest): Promise<Result<{ found: number; withVerifiedEmail: number }>>;
  };
  outreach: {
    prepare(request: OutreachRequest): Promise<Result<{ drafted: number; skipped: number }>>;
  };
  emails: {
    list(filter?: { companyId?: number; status?: string }): Promise<EmailRecord[]>;
    get(id: number): Promise<Result<EmailRecord>>;
    update(id: number, patch: DraftPatch): Promise<Result<EmailRecord>>;
    /** Creates an approval request. Never sends by itself. */
    requestSend(id: number): Promise<Result<ApprovalRequest>>;
    remove(id: number): Promise<Result<true>>;
  };
  audit: {
    list(limit?: number): Promise<AuditEntry[]>;
    exportCsv(): Promise<Result<string>>;
  };
  memory: {
    list(kind?: string): Promise<MemoryEntry[]>;
    remove(id: number): Promise<Result<true>>;
    clear(kind?: string): Promise<Result<number>>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<Result<AppSettings>>;
  };
  credentials: {
    status(): Promise<CredentialStatus[]>;
    set(key: CredentialKey, value: string): Promise<Result<true>>;
    clear(key: CredentialKey): Promise<Result<true>>;
    /** Live check against the provider. Returns a human-readable verdict. */
    test(key: CredentialKey): Promise<Result<string>>;
  };
  voice: {
    /** Server-side speech-to-text for the configured provider. */
    transcribe(audio: ArrayBuffer, mimeType: string): Promise<Result<string>>;
    /** Server-side text-to-speech. Returns audio bytes the renderer plays. */
    synthesize(text: string): Promise<Result<{ audio: ArrayBuffer; mimeType: string }>>;
    /** Which stack the renderer should use — depends on configured providers. */
    capabilities(): Promise<{ stt: string; tts: string; language: string; wakeWord: string }>;
  };
  system: {
    version(): Promise<{ app: string; electron: string; node: string; dataDir: string }>;
    openPath(target: string): Promise<Result<true>>;
    pickFile(options?: { multi?: boolean }): Promise<string[]>;
  };
  /** Subscribe to runtime events. Returns an unsubscribe function. */
  onEvent(listener: (event: JarvisEvent) => void): () => void;
}

/** Channel names. Keep in sync with `JarvisApi`; the main process allowlists these. */
export const IPC = {
  chatSend: 'chat:send',
  chatHistory: 'chat:history',
  chatNewConversation: 'chat:new',
  chatCancel: 'chat:cancel',

  approvalsList: 'approvals:list',
  approvalsApprove: 'approvals:approve',
  approvalsReject: 'approvals:reject',

  companiesSendDesk: 'companies:send-desk',
  companiesDossier: 'companies:dossier',
  companiesSetDnc: 'companies:set-dnc',
  companiesRemove: 'companies:remove',

  campaignsList: 'campaigns:list',
  campaignsCreate: 'campaigns:create',
  campaignsUpdate: 'campaigns:update',
  campaignsRemove: 'campaigns:remove',

  researchRun: 'research:run',
  outreachPrepare: 'outreach:prepare',

  emailsList: 'emails:list',
  emailsGet: 'emails:get',
  emailsUpdate: 'emails:update',
  emailsRequestSend: 'emails:request-send',
  emailsRemove: 'emails:remove',

  auditList: 'audit:list',
  auditExport: 'audit:export',

  memoryList: 'memory:list',
  memoryRemove: 'memory:remove',
  memoryClear: 'memory:clear',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  credentialsStatus: 'credentials:status',
  credentialsSet: 'credentials:set',
  credentialsClear: 'credentials:clear',
  credentialsTest: 'credentials:test',

  voiceTranscribe: 'voice:transcribe',
  voiceSynthesize: 'voice:synthesize',
  voiceCapabilities: 'voice:capabilities',

  systemVersion: 'system:version',
  systemOpenPath: 'system:open-path',
  systemPickFile: 'system:pick-file',

  event: 'jarvis:event',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
