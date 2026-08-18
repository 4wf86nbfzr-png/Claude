import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Konfiguration kommt aus Umgebungsvariablen bzw. einer .env-Datei.
 * Geheimnisse werden hier nur *gelesen*, nie geschrieben -- das macht der
 * CredentialService, der sie verschluesselt im Datenverzeichnis ablegt.
 */

/** Minimaler .env-Parser (kein dotenv-Paket noetig). */
export function parseDotenv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value.replace(/\\n/g, '\n');
  }
  return out;
}

/** Laedt .env in process.env, ohne bereits gesetzte Variablen zu ueberschreiben. */
export function loadDotenv(file = '.env', cwd = process.cwd()): boolean {
  const path = resolve(cwd, file);
  if (!existsSync(path)) return false;
  const parsed = parseDotenv(readFileSync(path, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
  return true;
}

const boolish = z
  .string()
  .transform((v) => ['1', 'true', 'yes', 'ja', 'on'].includes(v.trim().toLowerCase()));

const intish = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === '') return fallback;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : fallback;
    });

export const envSchema = z.object({
  JARVIS_DATA_DIR: z.string().optional(),
  JARVIS_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  JARVIS_LOCALE: z.string().default('de-DE'),

  // --- Sprachmodell -------------------------------------------------------
  JARVIS_LLM_PROVIDER: z.enum(['anthropic', 'openai', 'ollama']).default('anthropic'),
  JARVIS_LLM_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().default('https://api.anthropic.com'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OLLAMA_BASE_URL: z.string().default('http://127.0.0.1:11434'),

  // --- Sprache (STT/TTS) --------------------------------------------------
  JARVIS_STT_PROVIDER: z.enum(['openai', 'browser', 'none']).default('browser'),
  JARVIS_TTS_PROVIDER: z.enum(['openai', 'elevenlabs', 'browser', 'none']).default('browser'),
  JARVIS_TTS_VOICE: z.string().default('alloy'),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),

  // --- Websuche -----------------------------------------------------------
  JARVIS_SEARCH_PROVIDER: z.enum(['tavily', 'brave', 'serpapi', 'duckduckgo']).default('duckduckgo'),
  TAVILY_API_KEY: z.string().optional(),
  BRAVE_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),

  // --- Mailversand --------------------------------------------------------
  JARVIS_MAIL_TRANSPORT: z.enum(['smtp', 'gmail', 'graph', 'none']).default('none'),
  JARVIS_MAIL_FROM_NAME: z.string().optional(),
  JARVIS_MAIL_FROM_ADDRESS: z.string().optional(),
  JARVIS_MAIL_REPLY_TO: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: intish(587),
  SMTP_SECURE: boolish.optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  IMAP_HOST: z.string().optional(),
  IMAP_PORT: intish(993),
  IMAP_SECURE: boolish.optional(),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default('http://127.0.0.1:53682/oauth/google'),

  MS_CLIENT_ID: z.string().optional(),
  MS_CLIENT_SECRET: z.string().optional(),
  MS_TENANT_ID: z.string().default('common'),
  MS_REDIRECT_URI: z.string().default('http://127.0.0.1:53683/oauth/microsoft'),

  // --- Sicherheit / Compliance -------------------------------------------
  JARVIS_MAX_SENDS_PER_HOUR: intish(20),
  JARVIS_MAX_SENDS_PER_DAY: intish(100),
  JARVIS_MIN_SEND_INTERVAL_SECONDS: intish(20),
  /** Nur VERIFIZIERTE Adressen duerfen angeschrieben werden (Standard: ja). */
  JARVIS_REQUIRE_VERIFIED_RECIPIENT: boolish.default('true'),
  JARVIS_SECRETS_PASSPHRASE: z.string().optional(),

  // --- Recherche ----------------------------------------------------------
  JARVIS_HTTP_USER_AGENT: z
    .string()
    .default('JarvisResearchBot/1.0 (+lokaler Assistent; respektiert robots.txt)'),
  JARVIS_RESPECT_ROBOTS: boolish.default('true'),
  JARVIS_FETCH_TIMEOUT_MS: intish(15_000),
  JARVIS_MAX_PAGE_BYTES: intish(1_500_000),
  JARVIS_RESEARCH_CONCURRENCY: intish(3),
});

export type RawEnv = z.input<typeof envSchema>;
export type JarvisEnv = z.output<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): JarvisEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n  ');
    throw new Error(`Ungueltige Konfiguration:\n  ${issues}`);
  }
  return parsed.data;
}
