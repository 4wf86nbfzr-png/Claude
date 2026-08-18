import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type LlmProviderId = 'anthropic' | 'openai-kompatibel' | 'keiner';
export type SttProviderId = 'openai-kompatibel' | 'browser' | 'keiner';
export type TtsProviderId = 'openai-kompatibel' | 'elevenlabs' | 'browser' | 'keiner';
export type SearchProviderId = 'brave' | 'tavily' | 'serpapi' | 'keiner';
export type MailProviderId = 'smtp' | 'gmail' | 'keiner';

export interface SenderProfile {
  company: string;
  person: string;
  role: string;
  phone: string;
  web: string;
  address: string;
  signature: string;
  /** Kurzbeschreibung des eigenen Angebots – geht in die Mailerzeugung ein. */
  offering: string;
}

export interface JarvisConfig {
  dataDir: string;
  dbPath: string;
  attachmentsDir: string;
  llm: { provider: LlmProviderId; model: string; baseUrl: string | null; maxTokens: number };
  stt: { provider: SttProviderId; model: string; baseUrl: string | null; language: string };
  tts: { provider: TtsProviderId; model: string; voice: string; baseUrl: string | null };
  search: { provider: SearchProviderId; maxResults: number };
  mail: {
    provider: MailProviderId;
    fromName: string;
    fromAddress: string;
    replyTo: string | null;
    smtp: { host: string; port: number; secure: boolean; user: string };
    imap: { host: string; port: number; user: string; secure: boolean; mailbox: string };
  };
  limits: {
    dailySendLimit: number;
    /** Mehr Empfänger pro Nachricht als hier erlaubt gilt als Massenversand. */
    maxRecipientsPerMail: number;
    approvalTtlMinutes: number;
    /** Kein echter Versand – Nachrichten werden nur protokolliert. */
    dryRun: boolean;
    /** Mindestpause zwischen zwei Sendungen in Sekunden. */
    sendCooldownSeconds: number;
  };
  research: {
    userAgent: string;
    requestTimeoutMs: number;
    maxPagesPerCompany: number;
    respectRobotsTxt: boolean;
    /** Mindestpause zwischen zwei Abrufen desselben Hosts. */
    minDelayMs: number;
  };
  sender: SenderProfile;
}

/**
 * Lädt eine .env-Datei ohne zusätzliche Abhängigkeit.
 * Bereits gesetzte Prozessvariablen haben Vorrang – so kann man beim Start
 * einzelne Werte überschreiben, ohne die Datei anzufassen.
 */
export function loadEnvFile(path: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && env[key] === undefined) env[key] = value;
  }
}

const str = (env: NodeJS.ProcessEnv, key: string, fallback = ''): string => {
  const value = env[key];
  return value === undefined || value === '' ? fallback : value;
};

const num = (env: NodeJS.ProcessEnv, key: string, fallback: number): number => {
  const value = Number(env[key]);
  return Number.isFinite(value) && env[key] !== undefined && env[key] !== '' ? value : fallback;
};

const bool = (env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean => {
  const value = env[key]?.trim().toLowerCase();
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'ja', 'yes', 'on'].includes(value);
};

export function defaultDataDir(): string {
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(base, 'jarvis');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): JarvisConfig {
  const dataDir = str(env, 'JARVIS_DATA_DIR') || defaultDataDir();
  const llmProvider = str(env, 'JARVIS_LLM_PROVIDER', 'anthropic') as LlmProviderId;

  return {
    dataDir,
    dbPath: str(env, 'JARVIS_DB_PATH') || join(dataDir, 'jarvis.db'),
    attachmentsDir: str(env, 'JARVIS_ATTACHMENTS_DIR') || join(dataDir, 'anhaenge'),
    llm: {
      provider: llmProvider,
      model:
        str(env, 'JARVIS_LLM_MODEL') ||
        (llmProvider === 'anthropic' ? 'claude-sonnet-5' : 'gpt-4o-mini'),
      baseUrl: str(env, 'JARVIS_LLM_BASE_URL') || null,
      maxTokens: num(env, 'JARVIS_LLM_MAX_TOKENS', 4096)
    },
    stt: {
      provider: str(env, 'JARVIS_STT_PROVIDER', 'browser') as SttProviderId,
      model: str(env, 'JARVIS_STT_MODEL', 'whisper-1'),
      baseUrl: str(env, 'JARVIS_STT_BASE_URL') || null,
      language: str(env, 'JARVIS_STT_LANGUAGE', 'de')
    },
    tts: {
      provider: str(env, 'JARVIS_TTS_PROVIDER', 'browser') as TtsProviderId,
      model: str(env, 'JARVIS_TTS_MODEL', 'tts-1'),
      voice: str(env, 'JARVIS_TTS_VOICE', 'onyx'),
      baseUrl: str(env, 'JARVIS_TTS_BASE_URL') || null
    },
    search: {
      provider: str(env, 'JARVIS_SEARCH_PROVIDER', 'keiner') as SearchProviderId,
      maxResults: num(env, 'JARVIS_SEARCH_MAX_RESULTS', 10)
    },
    mail: {
      provider: str(env, 'JARVIS_MAIL_PROVIDER', 'keiner') as MailProviderId,
      fromName: str(env, 'MAIL_FROM_NAME', 'HERM Service Team'),
      fromAddress: str(env, 'MAIL_FROM_ADDRESS'),
      replyTo: str(env, 'MAIL_REPLY_TO') || null,
      smtp: {
        host: str(env, 'SMTP_HOST'),
        port: num(env, 'SMTP_PORT', 587),
        secure: bool(env, 'SMTP_SECURE', false),
        user: str(env, 'SMTP_USER')
      },
      imap: {
        host: str(env, 'IMAP_HOST'),
        port: num(env, 'IMAP_PORT', 993),
        user: str(env, 'IMAP_USER'),
        secure: bool(env, 'IMAP_SECURE', true),
        mailbox: str(env, 'IMAP_MAILBOX', 'INBOX')
      }
    },
    limits: {
      dailySendLimit: num(env, 'JARVIS_DAILY_SEND_LIMIT', 30),
      maxRecipientsPerMail: num(env, 'JARVIS_MAX_RECIPIENTS_PER_MAIL', 3),
      approvalTtlMinutes: num(env, 'JARVIS_APPROVAL_TTL_MINUTES', 30),
      dryRun: bool(env, 'JARVIS_DRY_RUN', false),
      sendCooldownSeconds: num(env, 'JARVIS_SEND_COOLDOWN_SECONDS', 20)
    },
    research: {
      userAgent: str(
        env,
        'JARVIS_USER_AGENT',
        'JarvisResearchBot/1.0 (+lokaler Assistent; Kontakt siehe Impressum des Betreibers)'
      ),
      requestTimeoutMs: num(env, 'JARVIS_HTTP_TIMEOUT_MS', 15000),
      maxPagesPerCompany: num(env, 'JARVIS_MAX_PAGES_PER_COMPANY', 6),
      respectRobotsTxt: bool(env, 'JARVIS_RESPECT_ROBOTS', true),
      minDelayMs: num(env, 'JARVIS_MIN_REQUEST_DELAY_MS', 1000)
    },
    sender: {
      company: str(env, 'JARVIS_SENDER_COMPANY', 'HERM Service Team e.K.'),
      person: str(env, 'JARVIS_SENDER_PERSON'),
      role: str(env, 'JARVIS_SENDER_ROLE'),
      phone: str(env, 'JARVIS_SENDER_PHONE'),
      web: str(env, 'JARVIS_SENDER_WEB', 'https://hermserviceteam.com'),
      address: str(env, 'JARVIS_SENDER_ADDRESS'),
      signature: str(env, 'JARVIS_SENDER_SIGNATURE'),
      offering: str(
        env,
        'JARVIS_SENDER_OFFERING',
        'Personaldienstleistung aus Hamburg: Sicherheitsdienst, Gastro- und Veranstaltungspersonal, Promotion, Logistik, Fahrservice und Reinigung.'
      )
    }
  };
}
