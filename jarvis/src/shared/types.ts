/**
 * Gemeinsame Typen für Main-, Preload- und Renderer-Prozess.
 *
 * Diese Datei ist der Vertrag zwischen den Prozessen. Sie darf keine
 * Node-Module importieren, weil sie auch im Renderer landet.
 */

// ---------------------------------------------------------------------------
// Zustand der Oberfläche
// ---------------------------------------------------------------------------

/** Was JARVIS gerade tut — wird groß unter dem Namen angezeigt. */
export type JarvisState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'WAITING FOR APPROVAL'
  | 'SPEAKING'
  | 'ERROR'

// ---------------------------------------------------------------------------
// Recherche / Firmen
// ---------------------------------------------------------------------------

/**
 * Belastbarkeit einer E-Mail-Adresse.
 *
 * VERIFIZIERT       Adresse stand wörtlich auf einer Seite des Unternehmens
 *                   (Impressum, Kontakt, Startseite) und ist syntaktisch und
 *                   per MX-Record zustellbar.
 * WAHRSCHEINLICH    Adresse stammt aus einer Quelle außerhalb der eigenen
 *                   Domain oder die Domain passt nicht exakt zur Website.
 * NICHT_VERIFIZIERT Alles andere. Darf nicht angeschrieben werden.
 */
export type VerificationStatus = 'VERIFIZIERT' | 'WAHRSCHEINLICH' | 'NICHT_VERIFIZIERT'

/** Wie eine Angabe zustande kam. Faktum vs. Einschätzung sauber trennen. */
export type Assertion = 'FAKT' | 'KI_EINSCHAETZUNG'

export interface Source {
  id: number
  url: string
  /** Impressum, Kontaktseite, Startseite, Suchtreffer, ... */
  kind: string
  title: string | null
  fetchedAt: string
  /** SHA-256 des abgerufenen Textes — belegt, worauf sich die Angabe stützt. */
  contentHash: string | null
  excerpt: string | null
}

export interface Company {
  id: number
  name: string
  website: string | null
  domain: string | null
  city: string | null
  postalCode: string | null
  country: string | null
  street: string | null
  industry: string | null
  description: string | null
  /** KI-Einschätzung, warum die Firma als Kunde interessant sein könnte. */
  acquisitionReason: string | null
  /** Wo die Einschätzung herkommt: welche Fakten wurden verwendet. */
  acquisitionBasis: string | null
  sizeHint: string | null
  phone: string | null
  contactPageUrl: string | null
  imprintUrl: string | null
  status: OutreachStatus
  doNotContact: boolean
  createdAt: string
  updatedAt: string
  lastContactedAt: string | null
  researchedAt: string | null
  notes: string | null
}

export interface Contact {
  id: number
  companyId: number
  firstName: string | null
  lastName: string | null
  fullName: string
  position: string | null
  phone: string | null
  sourceId: number | null
  createdAt: string
}

export interface EmailAddress {
  id: number
  companyId: number
  contactId: number | null
  address: string
  status: VerificationStatus
  /** Warum dieser Status vergeben wurde — im Klartext. */
  statusReason: string
  sourceId: number | null
  isPrimary: boolean
  mxChecked: boolean
  mxOk: boolean | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Akquise
// ---------------------------------------------------------------------------

export type OutreachStatus =
  | 'neu'
  | 'recherche_laeuft'
  | 'kontakt_gefunden'
  | 'entwurf_erstellt'
  | 'wartet_auf_freigabe'
  | 'freigegeben'
  | 'gesendet'
  | 'fehler'
  | 'antwort_erhalten'

export const OUTREACH_STATUS_LABEL: Record<OutreachStatus, string> = {
  neu: 'Neu',
  recherche_laeuft: 'Recherche läuft',
  kontakt_gefunden: 'Kontakt gefunden',
  entwurf_erstellt: 'Entwurf erstellt',
  wartet_auf_freigabe: 'Wartet auf Freigabe',
  freigegeben: 'Freigegeben',
  gesendet: 'Gesendet',
  fehler: 'Fehler',
  antwort_erhalten: 'Antwort erhalten'
}

export interface Campaign {
  id: number
  name: string
  service: string
  region: string
  radiusKm: number | null
  targetCount: number
  /** Freitext, der in den Mail-Prompt einfließt. */
  briefing: string | null
  status: 'entwurf' | 'aktiv' | 'pausiert' | 'abgeschlossen'
  createdAt: string
  updatedAt: string
}

export type EmailStatus =
  | 'entwurf'
  | 'wartet_auf_freigabe'
  | 'freigegeben'
  | 'gesendet'
  | 'fehler'

export interface EmailAttachment {
  filename: string
  path: string
  sizeBytes: number
  contentType: string | null
}

export interface EmailDraft {
  id: number
  campaignId: number | null
  companyId: number | null
  contactId: number | null
  toAddress: string
  toName: string | null
  cc: string | null
  bcc: string | null
  subject: string
  bodyText: string
  bodyHtml: string | null
  status: EmailStatus
  attachments: EmailAttachment[]
  /** Verifizierungsstatus der Empfängeradresse zum Zeitpunkt des Entwurfs. */
  recipientVerification: VerificationStatus
  approvalId: number | null
  messageId: string | null
  /** In-Reply-To / References für die Zuordnung späterer Antworten. */
  threadKey: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  sentAt: string | null
  /** Woraus die Personalisierung gespeist wurde — für die Nachvollziehbarkeit. */
  personalizationBasis: string | null
}

export interface InteractionHistoryEntry {
  id: number
  companyId: number
  contactId: number | null
  emailId: number | null
  kind: 'ausgehend' | 'eingehend' | 'notiz'
  channel: 'email' | 'telefon' | 'sonstiges'
  summary: string
  occurredAt: string
}

// ---------------------------------------------------------------------------
// Freigaben
// ---------------------------------------------------------------------------

/** Aktionen, die IMMER eine Freigabe brauchen. */
export type ApprovalAction =
  | 'email_senden'
  | 'email_bulk_senden'
  | 'datei_loeschen'
  | 'datei_ueberschreiben'
  | 'programm_installieren'
  | 'systemeinstellung_aendern'
  | 'kostenpflichtige_aktion'
  | 'account_aendern'
  | 'daten_veroeffentlichen'
  | 'formular_absenden'
  | 'nachricht_extern'

export const APPROVAL_ACTION_LABEL: Record<ApprovalAction, string> = {
  email_senden: 'E-Mail versenden',
  email_bulk_senden: 'Mehrere E-Mails versenden',
  datei_loeschen: 'Datei löschen',
  datei_ueberschreiben: 'Datei überschreiben',
  programm_installieren: 'Programm installieren',
  systemeinstellung_aendern: 'Systemeinstellung ändern',
  kostenpflichtige_aktion: 'Kostenpflichtige Aktion',
  account_aendern: 'Account ändern',
  daten_veroeffentlichen: 'Daten veröffentlichen',
  formular_absenden: 'Formular absenden',
  nachricht_extern: 'Nachricht an externe Person'
}

export type ApprovalStatus = 'offen' | 'freigegeben' | 'abgelehnt' | 'abgelaufen'

export interface ApprovalRequest {
  id: number
  action: ApprovalAction
  /** Eine Zeile, die in der Oberfläche groß steht. */
  title: string
  /** Strukturierte Details für die Anzeige (Empfänger, Betreff, Pfad, ...). */
  details: Record<string, string>
  /** Voller Text zum Vorlesen und Nachlesen (z. B. der Mailtext). */
  body: string | null
  status: ApprovalStatus
  requestedBy: string
  requestedAt: string
  decidedAt: string | null
  /** Wörtliche Äußerung des Nutzers, die als Freigabe gewertet wurde. */
  decisionUtterance: string | null
  relatedEmailId: number | null
  relatedCompanyId: number | null
}

// ---------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------

export type AuditLevel = 'info' | 'warn' | 'error'

export interface AuditEntry {
  id: number
  at: string
  actor: string
  action: string
  detail: string
  level: AuditLevel
  refType: string | null
  refId: number | null
}

// ---------------------------------------------------------------------------
// Gedächtnis
// ---------------------------------------------------------------------------

export type MemoryScope =
  | 'conversation'
  | 'user_preference'
  | 'company_note'
  | 'task'
  | 'system'

export interface MemoryFact {
  id: number
  scope: MemoryScope
  key: string
  value: string
  /** Freitextquelle: "vom Nutzer gesagt", "aus Recherche", ... */
  origin: string
  createdAt: string
  updatedAt: string
  expiresAt: string | null
}

export interface ConversationMessage {
  id: number
  conversationId: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  /** Nur bei role === 'tool': welches Tool. */
  toolName: string | null
  createdAt: string
}

export interface TaskItem {
  id: number
  title: string
  detail: string | null
  status: 'offen' | 'läuft' | 'erledigt' | 'abgebrochen'
  dueAt: string | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/**
 * Einheitliches Ergebnis jedes Tools.
 *
 * Ein Agent darf NIE behaupten, etwas getan zu haben. Er bekommt dieses
 * Objekt zurück und muss sich daran halten — auch bei ok === false.
 */
export type ToolResult<T = unknown> =
  | { ok: true; data: T; note?: string }
  | { ok: false; error: string; hint?: string; needsApproval?: boolean; approvalId?: number }

export interface ToolCallRecord {
  name: string
  input: unknown
  result: ToolResult
  startedAt: string
  finishedAt: string
}

// ---------------------------------------------------------------------------
// Chat / Ereignisse Richtung Renderer
// ---------------------------------------------------------------------------

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  at: string
  /** Welcher Agent geantwortet hat. */
  agent?: string
  toolCalls?: { name: string; ok: boolean; summary: string }[]
}

export type JarvisEvent =
  | { type: 'state'; state: JarvisState; note?: string }
  | { type: 'chat'; turn: ChatTurn }
  | { type: 'chat-delta'; id: string; delta: string }
  | { type: 'status'; message: string }
  | { type: 'approval'; request: ApprovalRequest }
  | { type: 'approval-resolved'; id: number; status: ApprovalStatus }
  | { type: 'audit'; entry: AuditEntry }
  | { type: 'data-changed'; what: 'companies' | 'emails' | 'campaigns' | 'memory' | 'tasks' }
  | { type: 'speak'; text: string; audioBase64?: string; mimeType?: string }
  | { type: 'error'; message: string; hint?: string }

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

export type LlmProviderId = 'anthropic' | 'openai' | 'ollama'
export type SttProviderId = 'openai' | 'deepgram' | 'browser'
export type TtsProviderId = 'openai' | 'elevenlabs' | 'browser'
export type SearchProviderId = 'brave' | 'tavily' | 'serpapi' | 'duckduckgo'
export type MailTransportId = 'smtp' | 'gmail' | 'none'

export interface JarvisSettings {
  llm: {
    provider: LlmProviderId
    model: string
    /** Nur Anthropic: low | medium | high | xhigh | max */
    effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    maxTokens: number
    baseUrl?: string
  }
  stt: { provider: SttProviderId; model: string; language: string }
  tts: { provider: TtsProviderId; voice: string; enabled: boolean }
  search: { provider: SearchProviderId; maxResults: number }
  mail: {
    transport: MailTransportId
    fromName: string
    fromAddress: string
    replyTo: string | null
    signature: string
    smtp: { host: string; port: number; secure: boolean; user: string }
    imap: { host: string; port: number; secure: boolean; user: string; mailbox: string }
    gmail: { clientId: string; redirectPort: number }
  }
  outreach: {
    /** Harte Obergrenze pro Tag. Schützt vor versehentlichem Massenversand. */
    dailySendLimit: number
    /** Sekunden zwischen zwei Sendungen. */
    minSecondsBetweenSends: number
    /** Nur VERIFIZIERTE Adressen dürfen angeschrieben werden. */
    requireVerifiedAddress: boolean
    /** Tage, in denen eine Firma nicht erneut erstkontaktiert wird. */
    reContactBlockDays: number
    senderCompany: string
    senderService: string
    optOutLine: string
  }
  research: {
    userAgent: string
    respectRobotsTxt: boolean
    requestDelayMs: number
    maxPagesPerCompany: number
  }
  files: {
    /**
     * Verzeichnisse, in denen JARVIS Dateien lesen und schreiben darf.
     * Der eigene Arbeitsordner ist immer dabei; alles andere muss hier stehen.
     */
    allowedRoots: string[]
    /** .ics-Dateien oder Ordner damit, die als Kalender gelesen werden. */
    calendarSources: string[]
  }
  ui: { locale: 'de'; voiceInputEnabled: boolean }
}

export interface CredentialStatus {
  key: string
  label: string
  set: boolean
  /**
   * Woher der Wert kommt, wenn gesetzt.
   * keychain  = Schlüsselbund des Betriebssystems (Electron safeStorage)
   * local-key = verschlüsselte Datei mit lokaler Schlüsseldatei (Rückfallweg)
   * env       = Umgebungsvariable
   */
  origin: 'keychain' | 'local-key' | 'env' | null
  required: boolean
  helpUrl: string | null
  description: string
}

export interface SetupCheck {
  id: string
  label: string
  ok: boolean
  detail: string
  /** Was der Nutzer tun muss, wenn ok === false. */
  todo: string | null
}

// ---------------------------------------------------------------------------
// Versandzentrale
// ---------------------------------------------------------------------------

/** Eine Zeile der Versandzentrale. Genau die Spalten aus der Anforderung. */
export interface SendCenterRow {
  companyId: number
  emailId: number | null
  company: string
  contact: string | null
  address: string | null
  sourceUrl: string | null
  verification: VerificationStatus | null
  acquisitionReason: string | null
  mailStatus: EmailStatus | null
  lastContactAt: string | null
  approvalStatus: ApprovalStatus | 'keine'
  campaignId: number | null
  campaignName: string | null
  outreachStatus: OutreachStatus
  subject: string | null
  doNotContact: boolean
}
