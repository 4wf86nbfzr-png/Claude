import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Jarvis } from '../src/jarvis.js';
import type { ChatRequest, ChatResponse, LlmProvider } from '../src/llm/types.js';
import type { MailTransport, OutgoingMessage, SendOutcome } from '../src/mail/types.js';
import { ok, err, type Result } from '../src/util/result.js';
import { silentLogger } from '../src/util/logger.js';

/** Sprachmodell-Attrappe: liefert vorbereitete Antworten der Reihe nach. */
export class FakeLlm implements LlmProvider {
  readonly id = 'anthropic' as const;
  readonly defaultModel = 'fake-modell';
  readonly requests: ChatRequest[] = [];
  private queue: Array<Partial<ChatResponse> | ((req: ChatRequest) => Partial<ChatResponse>)> = [];

  constructor(antworten: Array<Partial<ChatResponse> | ((req: ChatRequest) => Partial<ChatResponse>)> = []) {
    this.queue = [...antworten];
  }

  enqueue(...antworten: Array<Partial<ChatResponse> | ((req: ChatRequest) => Partial<ChatResponse>)>): void {
    this.queue.push(...antworten);
  }

  isConfigured(): boolean {
    return true;
  }
  missingConfigHint(): string | null {
    return null;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.requests.push(request);
    const next = this.queue.shift();
    const base: ChatResponse = {
      text: '',
      toolCalls: [],
      stopReason: 'stop',
      model: this.defaultModel,
    };
    if (!next) return { ...base, text: '(keine weitere Antwort hinterlegt)' };
    const partial = typeof next === 'function' ? next(request) : next;
    return { ...base, ...partial, toolCalls: partial.toolCalls ?? [] };
  }
}

/** Versand-Attrappe: merkt sich, was gesendet wurde, und kann Fehler simulieren. */
export class FakeTransport implements MailTransport {
  readonly id = 'smtp' as const;
  readonly label = 'Attrappe';
  readonly gesendet: OutgoingMessage[] = [];
  scheitertMit: string | null = null;

  isConfigured(): boolean {
    return true;
  }
  missingConfigHint(): string | null {
    return null;
  }
  async verify(): Promise<Result<{ info: string }>> {
    return ok({ info: 'Attrappe bereit' });
  }
  async defaultFrom(): Promise<string | null> {
    return 'absender@example.org';
  }
  async send(message: OutgoingMessage): Promise<Result<SendOutcome>> {
    if (this.scheitertMit) {
      return err('SEND_FAILED', this.scheitertMit);
    }
    this.gesendet.push(message);
    return ok({
      messageId: `<fake-${this.gesendet.length}@example.org>`,
      provider: 'smtp',
      accepted: message.to.map((t) => t.address),
      rejected: [],
      response: '250 OK',
    });
  }
}

export interface TestJarvis {
  jarvis: Jarvis;
  llm: FakeLlm;
  transport: FakeTransport;
  dir: string;
  dispose(): void;
}

/** Vollstaendig verdrahtete JARVIS-Instanz mit Attrappen, ohne Netzzugriff. */
export function makeJarvis(
  options: {
    env?: Record<string, string>;
    llm?: FakeLlm;
    transport?: FakeTransport;
    fetchImpl?: typeof fetch;
    /** Standard: alle Domains gelten als erreichbar (kein echtes DNS im Test). */
    mxCheck?: (address: string) => Promise<boolean | null>;
    /** Standard: jeder Programmstart „gelingt", ohne dass ein Prozess entsteht. */
    systemLauncher?: (command: string, args: string[]) => Promise<Result<{ befehl: string }>>;
    allowedRoots?: string[];
  } = {},
): TestJarvis {
  const dir = mkdtempSync(join(tmpdir(), 'jarvis-e2e-'));
  const llm = options.llm ?? new FakeLlm();
  const transport = options.transport ?? new FakeTransport();

  const env: NodeJS.ProcessEnv = {
    JARVIS_DATA_DIR: dir,
    JARVIS_LOG_LEVEL: 'silent',
    JARVIS_MAIL_FROM_ADDRESS: 'absender@example.org',
    JARVIS_MAIL_FROM_NAME: 'Test Absender',
    JARVIS_MIN_SEND_INTERVAL_SECONDS: '0',
    JARVIS_SECRETS_PASSPHRASE: 'testpassphrase',
    ...options.env,
  };

  const jarvis = Jarvis.create({
    dataDir: dir,
    env,
    loadDotenvFile: false,
    logger: silentLogger,
    overrides: {
      llm,
      mailTransport: transport,
      mailReader: null,
      mxCheck: options.mxCheck ?? (async () => true),
      systemLauncher:
        options.systemLauncher ?? (async (befehl, args) => ok({ befehl: [befehl, ...args].join(' ') })),
      allowedRoots: options.allowedRoots ?? [dir],
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    },
  });

  return {
    jarvis,
    llm,
    transport,
    dir,
    dispose() {
      jarvis.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Antwort-Attrappe fuer fetch, gesteuert ueber eine URL-Tabelle. */
export function fakeFetch(seiten: Record<string, { body: string; status?: number; contentType?: string }>): typeof fetch {
  return (async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const treffer = seiten[url] ?? seiten[url.replace(/\/$/, '')];
    if (!treffer) {
      return new Response('nicht gefunden', { status: 404, headers: { 'content-type': 'text/html' } });
    }
    return new Response(treffer.body, {
      status: treffer.status ?? 200,
      headers: { 'content-type': treffer.contentType ?? 'text/html; charset=utf-8' },
    });
  }) as unknown as typeof fetch;
}
