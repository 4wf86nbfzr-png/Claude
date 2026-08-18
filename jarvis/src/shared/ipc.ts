/**
 * IPC-Vertrag zwischen Renderer und Main.
 *
 * Der Renderer bekommt ausschließlich diese Methoden — kein `require`,
 * kein Node-Zugriff. contextIsolation bleibt an, nodeIntegration bleibt aus.
 */
import type {
  ApprovalRequest,
  AuditEntry,
  Campaign,
  Company,
  ConversationMessage,
  CredentialStatus,
  EmailDraft,
  JarvisEvent,
  JarvisSettings,
  MemoryFact,
  SendCenterRow,
  SetupCheck,
  TaskItem,
  ToolResult
} from './types'

export const IPC = {
  // Gespräch
  chatSend: 'jarvis:chat-send',
  chatCancel: 'jarvis:chat-cancel',
  chatHistory: 'jarvis:chat-history',
  chatNewConversation: 'jarvis:chat-new',

  // Ereignisstrom Main -> Renderer
  event: 'jarvis:event',

  // Freigaben
  approvalsList: 'approvals:list',
  approvalsDecide: 'approvals:decide',

  // Versandzentrale
  sendCenterList: 'sendcenter:list',
  sendCenterApprove: 'sendcenter:approve',
  sendCenterSendApproved: 'sendcenter:send-approved',

  // Firmen
  companiesList: 'companies:list',
  companyGet: 'companies:get',
  companyDelete: 'companies:delete',
  companySetDoNotContact: 'companies:set-dnc',

  // E-Mails
  emailGet: 'emails:get',
  emailUpdate: 'emails:update',
  emailList: 'emails:list',
  emailSyncReplies: 'emails:sync-replies',

  // Kampagnen
  campaignsList: 'campaigns:list',
  campaignCreate: 'campaigns:create',
  campaignRun: 'campaigns:run',

  // Protokoll / Gedächtnis / Aufgaben
  auditList: 'audit:list',
  memoryList: 'memory:list',
  memoryDelete: 'memory:delete',
  memoryClearScope: 'memory:clear-scope',
  tasksList: 'tasks:list',

  // Einstellungen / Zugänge / Einrichtung
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  credentialsStatus: 'credentials:status',
  credentialsSet: 'credentials:set',
  credentialsClear: 'credentials:clear',
  setupCheck: 'setup:check',
  mailTestConnection: 'mail:test-connection',
  gmailStartOAuth: 'mail:gmail-oauth',

  // Sprache
  voiceTranscribe: 'voice:transcribe',
  voiceSpeak: 'voice:speak',

  // System
  openPath: 'system:open-path',
  appInfo: 'system:app-info'
} as const

export interface SendCenterFilter {
  status?: string
  campaignId?: number
  search?: string
  limit?: number
}

export interface JarvisApi {
  chat: {
    send(text: string, opts?: { spoken?: boolean }): Promise<ToolResult<{ conversationId: number }>>
    cancel(): Promise<void>
    history(limit?: number): Promise<ConversationMessage[]>
    newConversation(): Promise<{ conversationId: number }>
  }
  onEvent(handler: (event: JarvisEvent) => void): () => void

  approvals: {
    list(status?: string): Promise<ApprovalRequest[]>
    decide(id: number, decision: 'freigegeben' | 'abgelehnt', utterance?: string): Promise<ToolResult<ApprovalRequest>>
  }

  sendCenter: {
    list(filter?: SendCenterFilter): Promise<SendCenterRow[]>
    approve(emailIds: number[]): Promise<ToolResult<{ approvalIds: number[] }>>
    sendApproved(emailIds: number[]): Promise<ToolResult<{ sent: number; failed: number; errors: string[] }>>
  }

  companies: {
    list(search?: string): Promise<Company[]>
    get(id: number): Promise<Company | null>
    remove(id: number): Promise<ToolResult<null>>
    setDoNotContact(id: number, value: boolean, reason?: string): Promise<ToolResult<null>>
  }

  emails: {
    get(id: number): Promise<EmailDraft | null>
    list(filter?: { status?: string; campaignId?: number }): Promise<EmailDraft[]>
    update(id: number, patch: Partial<Pick<EmailDraft, 'subject' | 'bodyText' | 'toAddress' | 'cc' | 'bcc'>>): Promise<ToolResult<EmailDraft>>
    syncReplies(): Promise<ToolResult<{ matched: number; scanned: number }>>
  }

  campaigns: {
    list(): Promise<Campaign[]>
    create(input: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<ToolResult<Campaign>>
    run(id: number): Promise<ToolResult<{ started: boolean }>>
  }

  audit: { list(limit?: number): Promise<AuditEntry[]> }
  memory: {
    list(scope?: string): Promise<MemoryFact[]>
    remove(id: number): Promise<ToolResult<null>>
    clearScope(scope: string): Promise<ToolResult<{ deleted: number }>>
  }
  tasks: { list(): Promise<TaskItem[]> }

  settings: {
    get(): Promise<JarvisSettings>
    set(patch: Record<string, unknown>): Promise<ToolResult<JarvisSettings>>
  }
  credentials: {
    status(): Promise<CredentialStatus[]>
    set(key: string, value: string): Promise<ToolResult<null>>
    clear(key: string): Promise<ToolResult<null>>
  }
  setup: { check(): Promise<SetupCheck[]> }
  mail: {
    testConnection(): Promise<ToolResult<{ transport: string; detail: string }>>
    startGmailOAuth(): Promise<ToolResult<{ email: string }>>
  }

  voice: {
    /** Audio als base64 (webm/opus aus dem MediaRecorder). */
    transcribe(audioBase64: string, mimeType: string): Promise<ToolResult<{ text: string }>>
    speak(text: string): Promise<ToolResult<{ audioBase64: string | null; mimeType: string | null }>>
  }

  system: {
    openPath(target: string): Promise<ToolResult<null>>
    appInfo(): Promise<{ version: string; dataDir: string; platform: string }>
  }
}

declare global {
  interface Window {
    jarvis: JarvisApi
  }
}
