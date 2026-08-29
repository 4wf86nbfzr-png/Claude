import { readFileSync, existsSync } from 'node:fs';
import { z } from 'zod';
import { E164Schema } from '@jarvis/domain';

/**
 * Konfiguration.
 *
 * Alles wird beim Start geprueft und schlaegt laut fehl, statt sich im
 * Betrieb als `undefined` zu zeigen. Geheimnisse stehen hier NICHT drin -
 * die liegen im Schluesselbund; die `.env` traegt nur Kennungen, Schalter
 * und Pfade.
 *
 * Die Datenschutz-Vorgaben sind bewusst keine normalen Schalter: in
 * Produktion sind sie unveraenderlich, egal was in der Umgebung steht.
 */
export const ModeSchema = z.enum(['simulation', 'dry-run', 'live']);
export type Mode = z.infer<typeof ModeSchema>;

const intFromEnv = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? fallback : Number(v)))
    .pipe(z.number().int().min(min).max(max));

export const ConfigSchema = z.object({
  nodeEnv: z.string().default('development'),
  mode: ModeSchema.default('simulation'),

  /**
   * Ueber welchen Weg Jarvis bedient wird.
   *
   * 'telefon' braucht einen SIP-Anschluss und Asterisk, 'chat' braucht nur
   * die WhatsApp Cloud API. 'beide' ist der Vollausbau. Die Freigaberegeln
   * sind in allen drei Faellen dieselben - nur der Kanal unterscheidet sich.
   */
  kanal: z.enum(['telefon', 'chat', 'beide']).default('beide'),

  // Leer erlaubt, weil ein reiner Chatbetrieb keine Rufnummern braucht.
  // Ob sie gebraucht werden, haengt am Kanal und wird unten geprueft.
  ownerPhone: E164Schema.or(z.literal('')),
  jarvisPhone: E164Schema.or(z.literal('')),

  ari: z.object({
    url: z.string().url().default('http://127.0.0.1:8088'),
    user: z.string().default('jarvis'),
    app: z.string().default('jarvis'),
    trunkEndpoint: z.string().default('PJSIP/gsm-gateway'),
    audioSocketHost: z.string().default('127.0.0.1'),
    audioSocketPort: intFromEnv(41000, 1024, 65535),
    codec: z.enum(['alaw', 'ulaw']).default('alaw'),
  }),

  privacy: z.object({
    storeRawAudio: z.literal(false),
    logMessageBodies: z.boolean(),
  }),

  behaviour: z.object({
    callOnEveryNewEmail: z.boolean(),
    callOnEveryNewWhatsapp: z.boolean(),
    callRetrySeconds: z.number().int().min(30).max(3600),
    callMaxPerHour: z.number().int().min(1).max(500),
    approvalExpiresSeconds: z.number().int().min(30).max(1800),
    timezone: z.string().default('Europe/Berlin'),
    mailSyncSeconds: z.number().int().min(15).max(3600),
  }),

  anthropic: z.object({
    model: z.string().default('claude-sonnet-5'),
  }),

  microsoft: z.object({
    tenantId: z.string().default('consumers'),
    clientId: z.string(),
    redirectUri: z.string().url(),
    account: z.string(),
  }),

  chat: z.object({
    /** Noahs eigene WhatsApp-Nummer, ohne fuehrendes Plus. */
    ownerWaId: z.string(),
    /** Nach dieser Pause beginnt ein neuer Gespraechsabschnitt. */
    idleMinutes: z.number().int().min(1).max(1440).default(60),
    requireLoginPin: z.boolean().default(false),
    /**
     * Zweiter Faktor fuer die Freigabe.
     *
     * 'pin' ist bequemer, bleibt aber im Chatverlauf stehen. 'totp' ist ein
     * Einmalcode aus einer Authenticator-App und nach einer halben Minute
     * wertlos - was im Chat der Unterschied zwischen einem zweiten Faktor
     * und einem Ritual ist.
     */
    secondFactor: z.enum(['pin', 'totp']).default('pin'),
    maxAnnouncementsPerTurn: z.number().int().min(1).max(20).default(3),
  }),

  whatsapp: z.object({
    phoneNumberId: z.string(),
    wabaId: z.string(),
    graphVersion: z.string().default('v23.0'),
    webhookPort: z.number().int().min(1024).max(65535),
    serviceWindowHours: z.number().int().min(1).max(168).default(24),
  }),

  speech: z.object({
    whisperBin: z.string(),
    whisperModel: z.string(),
    piperBin: z.string(),
    piperVoice: z.string(),
  }),

  db: z.object({
    path: z.string().default('./var/jarvis.db'),
    cipher: z.boolean(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Laedt eine .env-Datei, ohne eine Fremdbibliothek. */
export function loadDotEnv(path = '.env'): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    } else {
      // Kommentar am Zeilenende abschneiden. Nur mit Leerraum davor, damit
      // ein '#' im Wert selbst (etwa in einem Passwort) erhalten bleibt.
      // Ohne diesen Schritt wird aus "JARVIS_MODE=live   # Kommentar" der
      // Wert "live   # Kommentar", und die Konfigurationspruefung schlaegt
      // beim Start fehl.
      const comment = value.search(/\s#/);
      if (comment >= 0) value = value.slice(0, comment).trimEnd();
    }
    out[key] = value;
  }
  return out;
}

export interface LoadConfigOptions {
  readonly env?: Record<string, string | undefined>;
  readonly dotEnvPath?: string;
}

export function loadConfig(opts: LoadConfigOptions = {}): Config {
  const env = { ...loadDotEnv(opts.dotEnvPath ?? '.env'), ...(opts.env ?? process.env) };
  const mode = ModeSchema.parse(env['JARVIS_MODE'] ?? 'simulation');
  const isProduction = env['NODE_ENV'] === 'production' || mode === 'live';

  const raw = {
    nodeEnv: env['NODE_ENV'] ?? 'development',
    mode,
    kanal: env['JARVIS_KANAL'] ?? 'beide',
    ownerPhone: env['JARVIS_OWNER_PHONE_E164'] ?? '',
    jarvisPhone: env['JARVIS_SIM_PHONE_E164'] ?? '',
    ari: {
      url: env['ARI_URL'] ?? 'http://127.0.0.1:8088',
      user: env['ARI_USER'] ?? 'jarvis',
      app: env['ARI_APP'] ?? 'jarvis',
      trunkEndpoint: env['ARI_TRUNK_ENDPOINT'] ?? 'PJSIP/gsm-gateway',
      audioSocketHost: env['ARI_AUDIOSOCKET_HOST'] ?? '127.0.0.1',
      audioSocketPort: env['ARI_AUDIOSOCKET_PORT'],
      codec: env['ARI_CODEC'] ?? 'alaw',
    },
    privacy: {
      // Unveraenderlich in Produktion: keine Aufzeichnung, kein Roh-Audio auf Platte.
      storeRawAudio: false as const,
      logMessageBodies: isProduction ? false : env['LOG_MESSAGE_BODIES'] === 'true',
    },
    behaviour: {
      callOnEveryNewEmail: (env['CALL_ON_EVERY_NEW_EMAIL'] ?? 'true') === 'true',
      callOnEveryNewWhatsapp: (env['CALL_ON_EVERY_NEW_WHATSAPP'] ?? 'true') === 'true',
      callRetrySeconds: Number(env['CALL_RETRY_SECONDS'] ?? 120),
      callMaxPerHour: Number(env['CALL_MAX_PER_HOUR'] ?? 60),
      approvalExpiresSeconds: Number(env['APPROVAL_EXPIRES_SECONDS'] ?? 180),
      timezone: env['DEFAULT_TIMEZONE'] ?? 'Europe/Berlin',
      mailSyncSeconds: Number(env['MAIL_SYNC_SECONDS'] ?? 60),
    },
    anthropic: { model: env['JARVIS_MODEL'] ?? 'claude-sonnet-5' },
    microsoft: {
      tenantId: env['MS_TENANT_ID'] ?? 'consumers',
      clientId: env['MS_CLIENT_ID'] ?? '',
      redirectUri: env['MS_REDIRECT_URI'] ?? 'http://localhost:53682/callback',
      account: env['MS_ACCOUNT'] ?? '',
    },
    chat: {
      ownerWaId: (env['JARVIS_OWNER_WA_ID'] ?? env['JARVIS_OWNER_PHONE_E164'] ?? '').replace(/\D/g, ''),
      idleMinutes: Number(env['JARVIS_CHAT_IDLE_MINUTES'] ?? 60),
      requireLoginPin: (env['JARVIS_CHAT_REQUIRE_LOGIN_PIN'] ?? 'false') === 'true',
      secondFactor: env['JARVIS_CHAT_SECOND_FACTOR'] ?? 'pin',
      maxAnnouncementsPerTurn: Number(env['JARVIS_CHAT_MAX_ANNOUNCEMENTS'] ?? 3),
    },
    whatsapp: {
      phoneNumberId: env['WHATSAPP_PHONE_NUMBER_ID'] ?? '',
      wabaId: env['WHATSAPP_WABA_ID'] ?? '',
      graphVersion: env['WHATSAPP_GRAPH_VERSION'] ?? 'v23.0',
      webhookPort: Number(env['WHATSAPP_WEBHOOK_PORT'] ?? 8787),
      serviceWindowHours: Number(env['WHATSAPP_SERVICE_WINDOW_HOURS'] ?? 24),
    },
    speech: {
      whisperBin: env['WHISPER_BIN'] ?? '',
      whisperModel: env['WHISPER_MODEL'] ?? '',
      piperBin: env['PIPER_BIN'] ?? '',
      piperVoice: env['PIPER_VOICE'] ?? '',
    },
    db: {
      path: env['JARVIS_DB_PATH'] ?? './var/jarvis.db',
      cipher: (env['JARVIS_DB_CIPHER'] ?? 'false') === 'true',
    },
  };

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Die Konfiguration ist unvollstaendig oder falsch:\n${problems}`);
  }

  // Ein paar Dinge kann Zod nicht pruefen, weil sie Beziehungen zwischen
  // Feldern sind. Sie hier zu erschlagen ist besser, als sie im Betrieb zu
  // erleben.
  const c = parsed.data;
  const mitTelefon = c.kanal === 'telefon' || c.kanal === 'beide';
  const mitChat = c.kanal === 'chat' || c.kanal === 'beide';

  if (mitTelefon) {
    if (c.ownerPhone.length === 0 || c.jarvisPhone.length === 0) {
      throw new Error(
        `Bei JARVIS_KANAL=${c.kanal} muessen JARVIS_OWNER_PHONE_E164 und ` +
          'JARVIS_SIM_PHONE_E164 gesetzt sein.',
      );
    }
    if (c.ownerPhone === c.jarvisPhone) {
      throw new Error(
        'JARVIS_OWNER_PHONE_E164 und JARVIS_SIM_PHONE_E164 sind identisch. ' +
          'Jarvis wuerde sich selbst anrufen.',
      );
    }
  }

  if (mitChat && c.chat.ownerWaId.length === 0) {
    throw new Error(
      `Bei JARVIS_KANAL=${c.kanal} muss JARVIS_OWNER_WA_ID gesetzt sein - ` +
        'sonst weiss Jarvis nicht, von wem er Anweisungen annehmen darf.',
    );
  }

  // Die eigene Nummer als Gegenstelle waere eine Schleife: Jarvis wuerde auf
  // seine eigenen Nachrichten antworten.
  if (mitChat && c.chat.ownerWaId === c.whatsapp.phoneNumberId) {
    throw new Error(
      'JARVIS_OWNER_WA_ID und WHATSAPP_PHONE_NUMBER_ID sind identisch. ' +
        'Jarvis wuerde mit sich selbst schreiben.',
    );
  }
  if (c.mode === 'live') {
    if (c.microsoft.clientId.length === 0) {
      throw new Error('Im Live-Betrieb muss MS_CLIENT_ID gesetzt sein.');
    }
    if (c.speech.whisperBin.length === 0 || c.speech.piperBin.length === 0) {
      throw new Error('Im Live-Betrieb muessen WHISPER_BIN und PIPER_BIN gesetzt sein.');
    }
    if (!c.db.cipher) {
      throw new Error(
        'Im Live-Betrieb muss JARVIS_DB_CIPHER=true gesetzt sein - ' +
          'in der Datenbank stehen personenbezogene Daten.',
      );
    }
  }

  return c;
}

/** Fuer den Diagnosebericht: nur maskierte Werte. */
export function describeConfig(c: Config): Record<string, unknown> {
  const maskPhone = (p: string): string => `${p.slice(0, 4)}***${p.slice(-3)}`;
  return {
    mode: c.mode,
    nodeEnv: c.nodeEnv,
    kanal: c.kanal,
    ownerPhone: maskPhone(c.ownerPhone),
    jarvisPhone: maskPhone(c.jarvisPhone),
    ownerWaId: maskPhone(c.chat.ownerWaId),
    chatZweiterFaktor: c.chat.secondFactor,
    timezone: c.behaviour.timezone,
    storeRawAudio: c.privacy.storeRawAudio,
    logMessageBodies: c.privacy.logMessageBodies,
    callOnEveryNewEmail: c.behaviour.callOnEveryNewEmail,
    callOnEveryNewWhatsapp: c.behaviour.callOnEveryNewWhatsapp,
    callRetrySeconds: c.behaviour.callRetrySeconds,
    callMaxPerHour: c.behaviour.callMaxPerHour,
    approvalExpiresSeconds: c.behaviour.approvalExpiresSeconds,
    model: c.anthropic.model,
    microsoftConfigured: c.microsoft.clientId.length > 0,
    whatsappConfigured: c.whatsapp.phoneNumberId.length > 0,
    whisperConfigured: c.speech.whisperBin.length > 0,
    piperConfigured: c.speech.piperBin.length > 0,
    dbPath: c.db.path,
    dbEncrypted: c.db.cipher,
  };
}
