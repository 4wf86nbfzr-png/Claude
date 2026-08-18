import type { AppSettings } from '../../shared/types.js';
import type { KeyValueRepository } from '../db/repositories/misc.js';

export const DEFAULT_SETTINGS: AppSettings = {
  llm: {
    provider: 'anthropic',
    model: 'claude-opus-5',
    effort: 'high',
    maxTokens: 16000,
  },
  voice: {
    sttProvider: 'webspeech',
    ttsProvider: 'webspeech',
    language: 'de-DE',
    wakeWord: 'jarvis',
  },
  mail: {
    transport: 'none',
    identity: { name: '', email: '' },
  },
  research: {
    searchProvider: 'duckduckgo',
    crawlDelayMs: 1500,
    maxPagesPerCompany: 6,
    respectRobotsTxt: true,
    userAgent: 'JarvisResearchBot/1.0 (+lokaler Desktop-Assistent; Kontakt siehe Impressum)',
  },
  compliance: {
    dailySendLimit: 40,
    minSecondsBetweenSends: 30,
    reContactBlockDays: 90,
    requireVerifiedAddress: true,
  },
  integrations: {
    calendarIcsSources: [],
    fileRoots: [],
  },
  company: {
    name: '',
    services: '',
    pitch: '',
    website: '',
    phone: '',
    address: '',
  },
  setupCompleted: false,
};

const SETTINGS_KEY = 'app.settings';

/** Deep-merges a stored partial over the defaults so new keys get defaults. */
function merge<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return patch as T;
  }
  if (typeof patch !== 'object' || Array.isArray(patch)) return base;
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    result[key] = merge((base as Record<string, unknown>)[key], value);
  }
  return result as T;
}

export class SettingsService {
  private cached: AppSettings | null = null;

  constructor(private readonly kv: KeyValueRepository) {}

  get(): AppSettings {
    if (this.cached) return this.cached;
    const raw = this.kv.get(SETTINGS_KEY);
    if (!raw) {
      this.cached = structuredClone(DEFAULT_SETTINGS);
      return this.cached;
    }
    try {
      this.cached = merge(structuredClone(DEFAULT_SETTINGS), JSON.parse(raw));
    } catch {
      this.cached = structuredClone(DEFAULT_SETTINGS);
    }
    return this.cached;
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next = merge(this.get(), patch);
    this.kv.set(SETTINGS_KEY, JSON.stringify(next));
    this.cached = next;
    return next;
  }

  reload(): void {
    this.cached = null;
  }
}
