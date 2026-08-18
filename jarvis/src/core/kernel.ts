import { join } from 'node:path';
import { Db } from './db/database';
import { createRepositories, type Repositories } from './db/repositories';
import { JarvisCore } from './agents/jarvisCore';
import { ApprovalService } from './services/approval';
import { AuditLogService } from './services/audit';
import { defaultDataDir, loadConfig, loadEnvFile, type JarvisConfig } from './services/config';
import {
  CredentialService,
  NullEncryptor,
  PassphraseEncryptor,
  type Encryptor
} from './services/credentials';
import { EventBus } from './services/events';
import { createLlmProvider, type LlmProvider } from './services/llm';
import { MailService, type MailTransport } from './services/mail';
import { SystemService } from './services/system';
import { VoiceService } from './services/voice';
import { ResearchService } from './research';
import { createSearchProvider } from './research/search';
import { createToolRegistry, type ToolRegistry } from './tools';

export interface KernelOptions {
  env?: NodeJS.ProcessEnv;
  /** Verschlüsselung für den Zugangsdaten-Tresor (in der App: Electron safeStorage). */
  encryptor?: Encryptor;
  /** Zwischenablage (in der App: Electron clipboard). */
  clipboard?: { schreiben(text: string): void; lesen(): string };
  /** Für Tests: eigener HTTP-Abruf. */
  fetchImpl?: typeof fetch;
  /** Zusätzliche Verzeichnisse, in denen Dateiwerkzeuge arbeiten dürfen. */
  zusaetzlicheWurzeln?: string[];
  /** .env-Datei, die vor dem Lesen der Konfiguration geladen wird. */
  envDatei?: string;
  /**
   * Ersatzbausteine. Gedacht für Tests und für Versandwege, die später
   * ergänzt werden (z. B. Microsoft Graph), ohne den Kern anzufassen.
   */
  llm?: LlmProvider;
  mailTransport?: MailTransport;
  mxPruefer?: (adresse: string) => Promise<boolean>;
}

/**
 * Zusammenbau des Gesamtsystems.
 *
 * Alle Abhängigkeiten laufen hier einmal zusammen; Agenten und Werkzeuge
 * bekommen sie gereicht und beschaffen sie sich nirgends selbst. Damit lässt
 * sich der ganze Kern in Tests mit anderen Bausteinen betreiben – etwa ohne
 * Netzzugriff und ohne Electron.
 */
export class Kernel {
  private constructor(
    readonly config: JarvisConfig,
    readonly db: Db,
    readonly repos: Repositories,
    readonly credentials: CredentialService,
    readonly bus: EventBus,
    readonly audit: AuditLogService,
    readonly approvals: ApprovalService,
    readonly llm: LlmProvider,
    readonly mail: MailService,
    readonly research: ResearchService,
    readonly voice: VoiceService,
    readonly system: SystemService,
    readonly registry: ToolRegistry,
    readonly core: JarvisCore
  ) {}

  static create(options: KernelOptions = {}): Kernel {
    const env = options.env ?? process.env;
    // Reihenfolge: ausdrücklich genannte Datei, dann Projektordner, dann
    // Datenverzeichnis. Der erste gesetzte Wert gewinnt, bereits gesetzte
    // Umgebungsvariablen bleiben unangetastet.
    if (options.envDatei) loadEnvFile(options.envDatei, env);
    if (!options.env) {
      loadEnvFile(join(process.cwd(), '.env'), env);
      loadEnvFile(join(defaultDataDir(), '.env'), env);
    }
    const config = loadConfig(env);

    const db = Db.open(config.dbPath);
    const repos = createRepositories(db);

    const encryptor =
      options.encryptor ??
      (env.JARVIS_MASTER_KEY ? new PassphraseEncryptor(env.JARVIS_MASTER_KEY) : new NullEncryptor());
    const credentials = new CredentialService(join(config.dataDir, 'tresor.json'), encryptor, env);

    const bus = new EventBus();
    const audit = new AuditLogService(repos.audit, bus);
    const approvals = new ApprovalService(repos.approvals, audit, bus, config.limits.approvalTtlMinutes);

    const llm = options.llm ?? createLlmProvider(config, credentials);
    const mail = MailService.create(config, credentials, repos, audit, {
      ...(options.mailTransport ? { transport: options.mailTransport } : {})
    });
    const research = ResearchService.create(config, createSearchProvider(config, credentials), {
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.mxPruefer ? { mxPruefer: options.mxPruefer } : {})
    });
    const voice = VoiceService.create(config, credentials);
    const system = new SystemService({
      erlaubteWurzeln: [config.dataDir, ...(options.zusaetzlicheWurzeln ?? [])],
      ...(options.clipboard ? { clipboard: options.clipboard } : {})
    });

    const registry = createToolRegistry();
    const core = new JarvisCore({
      repos,
      config,
      credentials,
      registry,
      llm,
      mail,
      research,
      system,
      voice,
      approvals,
      audit,
      bus
    });

    audit.log('JARVIS gestartet', {
      actor: 'SYSTEM',
      status: 'INFO',
      detail: {
        datenbank: config.dbPath,
        sprachmodell: llm.id,
        versand: mail.transport.id,
        suche: research.search.id,
        testbetrieb: config.limits.dryRun
      }
    });

    return new Kernel(
      config,
      db,
      repos,
      credentials,
      bus,
      audit,
      approvals,
      llm,
      mail,
      research,
      voice,
      system,
      registry,
      core
    );
  }

  close(): void {
    this.db.close();
  }
}
