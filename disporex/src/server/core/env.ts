import { z } from "zod";

/**
 * Zentrale, validierte Konfiguration. Wird einmal beim Start gelesen.
 * Fehlende Pflichtwerte brechen den Start mit einer verständlichen Meldung ab.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://disporex_owner:disporex@localhost:5432/disporex"),
  DATABASE_APP_URL: z.string().min(1).optional(),
  DATABASE_TEST_URL: z.string().min(1).default("postgres://disporex_owner:disporex@localhost:5432/disporex_test"),
  APP_ENCRYPTION_KEY: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  SESSION_COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("DispoRex <noreply@example.com>"),
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().int().default(993),
  IMAP_USER: z.string().optional(),
  IMAP_PASS: z.string().optional(),
  IMAP_FOLDER: z.string().default("INBOX"),
  AI_PROVIDER: z.enum(["none", "anthropic"]).default("none"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-sonnet-5-5"),
  AI_MONTHLY_TOKEN_BUDGET: z.coerce.number().int().nonnegative().default(2_000_000),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  RATE_LIMIT_API_PER_MINUTE: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(10),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Ungültige Umgebungskonfiguration:\n  ${issues}`);
  }
  const value = parsed.data;
  if (value.APP_ENV === "production") {
    if (!value.APP_ENCRYPTION_KEY || value.APP_ENCRYPTION_KEY.length < 32) {
      throw new Error("APP_ENCRYPTION_KEY (mind. 32 Zeichen) ist in Produktion Pflicht.");
    }
    if (!value.DATABASE_APP_URL) {
      throw new Error("DATABASE_APP_URL (eingeschränkte Anwendungsrolle) ist in Produktion Pflicht.");
    }
  }
  cached = value;
  return value;
}

export function isTest(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

/** Nur für Tests: Konfiguration neu einlesen. */
export function resetEnvCache(): void {
  cached = null;
}
