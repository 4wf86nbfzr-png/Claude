import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JarvisError, JarvisEvent, Result } from '../src/shared/types.js';
import { err, makeError, ok } from '../src/shared/types.js';
import { createRuntime, type JarvisRuntime } from '../src/core/runtime.js';
import type { SecretBox } from '../src/core/services/CredentialService.js';
import type { SystemBridge } from '../src/core/agents/SystemAgent.js';
import type { MailTransport, OutgoingMessage, SendReceipt } from '../src/core/mail/types.js';
import type { LlmProvider, LlmRequest, LlmResponse } from '../src/core/llm/types.js';

/** Reversible "encryption" — the test only cares that plaintext never lands in the DB. */
export const testSecretBox: SecretBox = {
  name: 'test',
  available: () => true,
  encrypt: (plaintext) => `t1.${Buffer.from(plaintext, 'utf8').toString('base64')}`,
  decrypt: (ciphertext) => Buffer.from(ciphertext.slice(3), 'base64').toString('utf8'),
};

export const testSystemBridge: SystemBridge = {
  platform: 'linux',
  appVersion: '0.0.0-test',
  electronVersion: '0.0.0-test',
  openExternal: async () => undefined,
  openPath: async () => '',
  writeClipboard: () => undefined,
  readClipboard: () => '',
  launchApplication: async (name) => ok(`${name} (Test)`),
};

/** Records what would have been sent, and can be told to fail. */
export class RecordingTransport implements MailTransport {
  readonly name = 'Testversand';
  readonly sent: OutgoingMessage[] = [];
  failWith: JarvisError | null = null;

  async send(message: OutgoingMessage): Promise<Result<SendReceipt, JarvisError>> {
    if (this.failWith) return err(this.failWith);
    this.sent.push(message);
    return ok({
      messageId: `<test-${this.sent.length}@example.invalid>`,
      accepted: [message.to],
      rejected: [],
      response: '250 OK (Test)',
    });
  }

  async verify(): Promise<Result<string, JarvisError>> {
    return ok('Testversand bereit');
  }
}

/** Replays a fixed script of model turns, so the loop is deterministic. */
export class ScriptedLlm implements LlmProvider {
  readonly name = 'scripted';
  readonly model = 'test-model';
  readonly requests: LlmRequest[] = [];
  private index = 0;

  /** Mutable so a test can seed data first and then queue the turns. */
  constructor(readonly script: LlmResponse[] = []) {}

  queue(...responses: LlmResponse[]): this {
    this.script.push(...responses);
    return this;
  }

  async complete(request: LlmRequest): Promise<Result<LlmResponse, JarvisError>> {
    this.requests.push(request);
    const next = this.script[this.index];
    this.index += 1;
    if (!next) {
      return ok({ content: [{ type: 'text', text: 'Fertig.' }], stopReason: 'end_turn' });
    }
    for (const block of next.content) {
      if (block.type === 'text') request.onTextDelta?.(block.text);
    }
    return ok(next);
  }

  async ping(): Promise<Result<string, JarvisError>> {
    return ok('scripted');
  }
}

export interface TestHarness {
  runtime: JarvisRuntime;
  transport: RecordingTransport;
  events: JarvisEvent[];
  dispose(): void;
}

export function createHarness(options: { llm?: LlmProvider } = {}): TestHarness {
  const dataDir = mkdtempSync(join(tmpdir(), 'jarvis-test-'));
  const transport = new RecordingTransport();
  const events: JarvisEvent[] = [];

  const runtime = createRuntime({
    dataDir,
    databaseFile: ':memory:',
    secretBox: testSecretBox,
    systemBridge: testSystemBridge,
    emit: (event) => events.push(event),
    overrides: {
      mailTransport: () => ok(transport),
      ...(options.llm ? { llm: () => ok(options.llm!) } : {}),
    },
  });

  // A working postbox, so tests exercise the gate rather than the setup check.
  runtime.services.settings.update({
    mail: {
      transport: 'smtp',
      identity: { name: 'HERM Service Team', email: 'dispo@example.invalid', signature: 'HERM Service Team' },
      smtp: { host: 'smtp.example.invalid', port: 587, secure: false, user: 'dispo@example.invalid' },
    },
    company: { name: 'HERM Service Team e.K.', services: 'Sicherheitsdienst', pitch: '', website: '', phone: '', address: '' },
  });
  runtime.services.credentials.set('smtp.password', 'geheim-test');

  return {
    runtime,
    transport,
    events,
    dispose(): void {
      runtime.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Creates a company with one verified address, the normal precondition. */
export function seedCompany(
  runtime: JarvisRuntime,
  options: { name?: string; domain?: string; address?: string } = {},
): { companyId: number; address: string } {
  const name = options.name ?? 'Nordbau Hamburg GmbH';
  const domain = options.domain ?? 'nordbau-hamburg.example';
  const address = options.address ?? `info@${domain}`;

  const { company } = runtime.repos.companies.upsert({
    name,
    domain,
    website: `https://${domain}/`,
    city: 'Hamburg',
    industry: 'Hochbau',
    description: 'Hochbau und Projektentwicklung laut Website.',
  });
  runtime.repos.companies.addEmailAddress({
    companyId: company.id,
    address,
    status: 'VERIFIZIERT',
    reason: 'Wörtlich im Impressum veröffentlicht.',
    sourceUrl: `https://${domain}/impressum`,
    mxChecked: true,
    mxOk: true,
  });
  return { companyId: company.id, address };
}

export const testError = (code = 'test.fehler'): JarvisError => makeError(code, 'Testfehler');
