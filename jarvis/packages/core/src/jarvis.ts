import { loadEnv, loadDotenv, type JarvisEnv } from './config/env.js';
import { ensurePaths, resolvePaths, type JarvisPaths } from './config/paths.js';
import { openDatabase, type Db } from './db/database.js';
import { createRepositories, type Repositories } from './db/repos/index.js';
import { ComplianceGuard, DEFAULT_LIMITS, type ComplianceLimits } from './compliance/guard.js';
import { createLlmProvider } from './llm/index.js';
import type { LlmMessage, LlmProvider } from './llm/types.js';
import { createMailTransport, ImapReader } from './mail/index.js';
import { MailService } from './mail/service.js';
import type { MailReader } from './mail/types.js';
import { OutreachService } from './outreach/service.js';
import { createSearchProvider, PageFetcher, ResearchService } from './research/index.js';
import { ApprovalService } from './services/approval.js';
import { AuditLogService } from './services/audit.js';
import { CredentialService, type ExternalSecretStore } from './services/credentials.js';
import { EventBus } from './services/events.js';
import { MemoryService } from './services/memory.js';
import { createToolRegistry, registerSystemExecutors } from './tools/index.js';
import type { ToolRegistry } from './tools/types.js';
import { defaultAllowedRoots, SystemService, type ClipboardBridge } from './system/index.js';
import { IcsCalendar, type CalendarSource } from './calendar/index.js';
import { VoiceService } from './voice/index.js';
import { createLogger, type Logger } from './util/logger.js';
import { err, ok, type Result } from './util/result.js';
import { truncate } from './util/text.js';
import type { JarvisContext } from './context.js';
import { withAgentName } from './context.js';
import { Agent, createAgents } from './agents/index.js';
import type { AgentRunResult } from './agents/base.js';
import type { ApprovalRow } from './db/schema.js';

export interface CreateJarvisOptions {
  /** Datenverzeichnis; Standard ~/.jarvis bzw. JARVIS_DATA_DIR. */
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
  /** .env laden (im Desktop ja, in Tests nein). */
  loadDotenvFile?: boolean;
  /** Schluesselbund des Betriebssystems, vom Desktop eingehaengt. */
  secretStore?: ExternalSecretStore;
  clipboard?: ClipboardBridge;
  logger?: Logger;
  /** Nur fuer Tests: fertige Bausteine unterschieben. */
  overrides?: Partial<{
    llm: LlmProvider;
    mailTransport: Parameters<MailService['setTransport']>[0];
    mailReader: MailReader | null;
    calendar: CalendarSource;
    research: ResearchService;
    fetchImpl: typeof fetch;
    mxCheck: (address: string) => Promise<boolean | null>;
  }>;
}

/**
 * Die zusammengesetzte Anwendung.
 *
 * Alles, was Oberflaeche, CLI oder Tests brauchen, geht ueber diese Klasse.
 * Der Electron-Hauptprozess kennt nur sie und den EventBus.
 */
export class Jarvis {
  readonly bus: EventBus;
  readonly env: JarvisEnv;
  readonly paths: JarvisPaths;
  readonly repos: Repositories;
  readonly approvals: ApprovalService;
  readonly audit: AuditLogService;
  readonly memory: MemoryService;
  readonly credentials: CredentialService;
  readonly mail: MailService;
  readonly research: ResearchService;
  readonly outreach: OutreachService;
  readonly voice: VoiceService;
  readonly system: SystemService;
  readonly registry: ToolRegistry;
  readonly core: Agent;
  readonly fachagenten: Map<string, Agent>;
  readonly logger: Logger;

  private readonly db: Db;
  private readonly baseContext: JarvisContext;
  /**
   * Wenn JARVIS gerade nach einer Freigabe gefragt hat, steht hier deren
   * Kennung. Nur dann zaehlt ein blosses "ja" als Zustimmung.
   */
  private offeneRueckfrage: { approvalId: string; gestelltAm: number } | null = null;
  private laufenderAuftrag: AbortController | null = null;
  private geschlossen = false;

  private constructor(parts: {
    env: JarvisEnv;
    paths: JarvisPaths;
    db: Db;
    context: JarvisContext;
    core: Agent;
    fachagenten: Map<string, Agent>;
  }) {
    this.env = parts.env;
    this.paths = parts.paths;
    this.db = parts.db;
    this.baseContext = parts.context;
    this.bus = parts.context.bus;
    this.repos = parts.context.repos;
    this.approvals = parts.context.approvals;
    this.audit = parts.context.audit;
    this.memory = parts.context.memory;
    this.credentials = parts.context.credentials;
    this.mail = parts.context.mail;
    this.research = parts.context.research;
    this.outreach = parts.context.outreach;
    this.voice = parts.context.voice;
    this.system = parts.context.system;
    this.registry = parts.context.registry;
    this.logger = parts.context.logger;
    this.core = parts.core;
    this.fachagenten = parts.fachagenten;
  }

  // -------------------------------------------------------------------------
  // Aufbau
  // -------------------------------------------------------------------------

  static create(options: CreateJarvisOptions = {}): Jarvis {
    if (options.loadDotenvFile !== false) loadDotenv();
    const env = loadEnv(options.env ?? process.env);
    const paths = ensurePaths(resolvePaths(options.dataDir));
    const logger = options.logger ?? createLogger(env.JARVIS_LOG_LEVEL, 'jarvis');
    const bus = new EventBus();

    const db = openDatabase({ file: paths.dbFile });
    const repos = createRepositories(db);

    const audit = new AuditLogService(repos.audit, bus);
    const approvals = new ApprovalService({ repo: repos.approvals, audit, bus });
    const memory = new MemoryService(repos.memory, repos.conversations);
    const credentials = new CredentialService({
      secretsFile: paths.secretsFile,
      keyFile: paths.keyFile,
      passphrase: env.JARVIS_SECRETS_PASSPHRASE,
      env: options.env ?? process.env,
      external: options.secretStore,
      logger,
    });

    const limits: ComplianceLimits = {
      ...DEFAULT_LIMITS,
      maxPerHour: env.JARVIS_MAX_SENDS_PER_HOUR,
      maxPerDay: env.JARVIS_MAX_SENDS_PER_DAY,
      minIntervalSeconds: env.JARVIS_MIN_SEND_INTERVAL_SECONDS,
      requireVerifiedRecipient: env.JARVIS_REQUIRE_VERIFIED_RECIPIENT,
      reContactCooldownDays: repos.settings.get('compliance.reContactCooldownDays', DEFAULT_LIMITS.reContactCooldownDays),
    };
    const compliance = new ComplianceGuard(repos.suppression, repos.emails, repos.companies, limits);

    const llm = options.overrides?.llm ?? createLlmProvider(env, credentials);

    const mail = new MailService({
      env,
      repos,
      compliance,
      approvals,
      audit,
      bus,
      transport: options.overrides?.mailTransport ?? createMailTransport(env, credentials),
    });

    const fetchImpl = options.overrides?.fetchImpl ?? fetch;
    const research =
      options.overrides?.research ??
      new ResearchService({
        env,
        repos,
        audit,
        bus,
        search: createSearchProvider(env, credentials),
        fetcher: new PageFetcher(env, fetchImpl),
        ...(options.overrides?.mxCheck ? { mxCheck: options.overrides.mxCheck } : {}),
      });

    const allowedRoots = repos.settings.get<string[]>('system.allowedRoots', defaultAllowedRoots(paths.dataDir));
    const system = new SystemService({
      allowedRoots,
      logger: logger.child('system'),
      clipboard: options.clipboard ?? null,
    });

    const calendar =
      options.overrides?.calendar ??
      new IcsCalendar(repos.settings.get<string | null>('calendar.ics', null), system, fetchImpl);

    const outreach = new OutreachService({ repos, research, mail, llm, compliance, audit, memory, bus });
    const voice = new VoiceService(env, credentials, paths.audioDir, fetchImpl);

    const mailReader =
      options.overrides?.mailReader !== undefined ? options.overrides.mailReader : new ImapReader(env, credentials);

    const registry = createToolRegistry();
    registerSystemExecutors(approvals, system, audit);

    const context: JarvisContext = {
      env,
      paths,
      logger,
      bus,
      repos,
      audit,
      approvals,
      memory,
      credentials,
      compliance,
      llm,
      mail,
      mailReader,
      research,
      outreach,
      voice,
      system,
      calendar,
      registry,
      actor: 'benutzer',
      agent: 'JarvisCore',
      conversationId: null,
      withAgent(agent: string) {
        return withAgentName(this, agent);
      },
    };

    const { core, fachagenten } = createAgents(registry);

    audit.log({
      actor: 'system',
      action: 'start',
      summary: 'JARVIS gestartet',
      detail: {
        modell: `${llm.id}/${llm.defaultModel}`,
        versand: mail.transportStatus().id,
        suche: research.providerLabel,
      },
    });

    return new Jarvis({ env, paths, db, context, core, fachagenten });
  }

  // -------------------------------------------------------------------------
  // Gespraech
  // -------------------------------------------------------------------------

  /** Startet ein neues Gespraech und liefert dessen Kennung. */
  startConversation(title = 'Neues Gespräch'): string {
    return this.memory.startConversation(title);
  }

  /**
   * Der Haupteinstieg: eine Eingabe des Benutzers verarbeiten.
   *
   * Prueft zuerst, ob es sich um eine Antwort auf eine Freigabefrage handelt --
   * dann wird nicht das Modell befragt, sondern die Entscheidung ausgefuehrt.
   */
  async ask(
    text: string,
    options: { conversationId?: string; actor?: string } = {},
  ): Promise<Result<{ antwort: string; agent: string; konversationId: string; freigabeEntschieden?: string }>> {
    const eingabe = text.trim();
    if (!eingabe) return err('INVALID_INPUT', 'Es wurde nichts gesagt.');

    const conversationId = options.conversationId ?? this.startConversation(truncate(eingabe, 60));
    this.memory.appendUser(conversationId, eingabe);
    this.bus.emit('message', { conversationId, role: 'user', content: eingabe });

    // 1. Ist das eine Antwort auf eine offene Freigabefrage?
    const entscheidung = this.interpretApprovalUtterance(eingabe);
    if (entscheidung.art !== 'keine') {
      const antwort = await this.handleApprovalUtterance(entscheidung, conversationId);
      if (antwort) return antwort;
    }

    // 2. Regulaerer Durchlauf ueber JarvisCore.
    const controller = new AbortController();
    this.laufenderAuftrag = controller;
    const ctx: JarvisContext = {
      ...this.baseContext,
      actor: options.actor ?? 'benutzer',
      conversationId,
      signal: controller.signal,
      withAgent(agent: string) {
        return withAgentName(this, agent);
      },
    };

    const verlauf = this.historyAsMessages(conversationId);
    const result = await this.core.run({ task: eingabe, history: verlauf, conversationId }, ctx);
    this.laufenderAuftrag = null;

    if (!result.ok) {
      this.bus.emit('status', { state: 'ERROR' });
      this.bus.emit('error', { message: result.error.message, hint: result.error.hint });
      return result;
    }

    this.persistRun(conversationId, result.data);
    this.merkeOffeneRueckfrage(result.data.text);

    this.bus.emit('message', { conversationId, role: 'assistant', content: result.data.text, agent: result.data.agent });
    this.bus.emit('status', { state: this.approvals.pending().length > 0 ? 'WAITING FOR APPROVAL' : 'IDLE' });

    return ok({ antwort: result.data.text, agent: result.data.agent, konversationId: conversationId });
  }

  /** Bricht den laufenden Auftrag ab. */
  abort(): boolean {
    if (!this.laufenderAuftrag) return false;
    this.laufenderAuftrag.abort(new Error('Vom Benutzer abgebrochen'));
    this.laufenderAuftrag = null;
    this.bus.emit('status', { state: 'IDLE', detail: 'abgebrochen' });
    return true;
  }

  private historyAsMessages(conversationId: string): LlmMessage[] {
    // Nur Benutzer- und Assistententext -- Werkzeugverlaeufe bleiben im Lauf.
    return this.memory
      .history(conversationId, 24)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
      .map((m) =>
        m.role === 'user'
          ? ({ role: 'user', content: m.content } as const)
          : ({ role: 'assistant', content: m.content } as const),
      )
      .filter((m) => m.content.trim().length > 0);
  }

  private persistRun(conversationId: string, run: AgentRunResult): void {
    this.memory.appendAssistant(conversationId, run.text, run.agent, run.steps);
  }

  // -------------------------------------------------------------------------
  // Freigaben
  // -------------------------------------------------------------------------

  pendingApprovals(): Array<ApprovalRow & { details: ReturnType<ApprovalService['details']> }> {
    return this.approvals.pending().map((a) => ({ ...a, details: this.approvals.details(a) }));
  }

  async approve(approvalId: string, note?: string): Promise<Result<unknown>> {
    this.offeneRueckfrage = null;
    const r = await this.approvals.approve(approvalId, 'benutzer', note);
    this.bus.emit('status', { state: this.approvals.pending().length > 0 ? 'WAITING FOR APPROVAL' : 'IDLE' });
    if (!r.ok) this.bus.emit('error', { message: r.error.message, hint: r.error.hint });
    return r;
  }

  reject(approvalId: string, note?: string): Result<unknown> {
    this.offeneRueckfrage = null;
    return this.approvals.reject(approvalId, 'benutzer', note);
  }

  /**
   * Merkt sich, dass JARVIS gerade eine Freigabefrage gestellt hat.
   * Nur dann darf ein knappes "ja" als Zustimmung gelten.
   */
  private merkeOffeneRueckfrage(antwort: string): void {
    const offene = this.approvals.pending();
    if (offene.length !== 1) {
      this.offeneRueckfrage = null;
      return;
    }
    const fragtNachFreigabe = /freigeben\?|freigabe\?|senden\?|versenden\?|abschicken\?/i.test(antwort);
    this.offeneRueckfrage = fragtNachFreigabe ? { approvalId: offene[0]!.id, gestelltAm: Date.now() } : null;
  }

  private async handleApprovalUtterance(
    entscheidung: ApprovalUtterance,
    conversationId: string,
  ): Promise<Result<{ antwort: string; agent: string; konversationId: string; freigabeEntschieden?: string }> | null> {
    const offene = this.approvals.pending();
    if (offene.length === 0) return null;

    // Welche Freigabe ist gemeint?
    let ziel: ApprovalRow | undefined;
    if (entscheidung.nummer !== undefined) {
      ziel = this.approvals.resolveByOrdinal(entscheidung.nummer);
      if (!ziel) {
        return this.antworte(conversationId, `Es gibt keine offene Freigabe mit der Nummer ${entscheidung.nummer}. Offen sind ${offene.length}.`);
      }
    } else if (offene.length === 1) {
      ziel = offene[0];
    } else if (entscheidung.art === 'zustimmung' && this.offeneRueckfrage) {
      ziel = this.approvals.get(this.offeneRueckfrage.approvalId);
    }

    if (!ziel) {
      // Mehrdeutig -> nachfragen statt raten. Das ist der wichtige Fall.
      const liste = offene.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
      return this.antworte(
        conversationId,
        `Es sind ${offene.length} Freigaben offen — welche meinen Sie?\n${liste}\nSagen Sie zum Beispiel "Nummer 2 freigeben".`,
      );
    }

    // Ein blosses "ja" zaehlt nur unmittelbar nach einer Freigabefrage.
    if (entscheidung.art === 'zustimmung' && entscheidung.staerke === 'schwach') {
      const passt = this.offeneRueckfrage?.approvalId === ziel.id && Date.now() - this.offeneRueckfrage.gestelltAm < 10 * 60_000;
      if (!passt) {
        return this.antworte(
          conversationId,
          `Zur Sicherheit noch einmal ausdrücklich: "${ziel.summary}" — bitte mit "freigeben" oder "abbrechen" antworten.`,
        );
      }
    }

    if (entscheidung.art === 'ablehnung') {
      const r = this.reject(ziel.id, 'Vom Benutzer abgelehnt');
      const text = r.ok
        ? `In Ordnung, ${ziel.title} wurde nicht ausgeführt. Der Entwurf bleibt gespeichert.`
        : `Das ging nicht: ${r.error.message}`;
      return this.antworte(conversationId, text, ziel.id);
    }

    const ergebnis = await this.approve(ziel.id, 'Freigabe durch den Benutzer');
    if (!ergebnis.ok) {
      return this.antworte(conversationId, `Ausführung fehlgeschlagen: ${ergebnis.error.message}${ergebnis.error.hint ? ` ${ergebnis.error.hint}` : ''}`, ziel.id);
    }
    return this.antworte(conversationId, this.beschreibeAusfuehrung(ziel, ergebnis.data), ziel.id);
  }

  private beschreibeAusfuehrung(approval: ApprovalRow, ergebnis: unknown): string {
    if (approval.action_type === 'mail.senden') {
      const payload = this.approvals.payload(approval);
      const email = this.repos.emails.get(String(payload.entityId ?? ''));
      return email
        ? `Die E-Mail an ${email.to_address} wurde versendet.`
        : 'Die E-Mail wurde versendet.';
    }
    if (approval.action_type === 'mail.bulk_senden') {
      const d = ergebnis as { gesendet?: string[]; fehlgeschlagen?: Array<{ grund: string }> };
      const gesendet = d.gesendet?.length ?? 0;
      const fehler = d.fehlgeschlagen?.length ?? 0;
      return fehler > 0
        ? `${gesendet} Mails wurden versendet, ${fehler} nicht. Die Fehler stehen in der Versandzentrale.`
        : `Alle ${gesendet} Mails wurden versendet.`;
    }
    return `${approval.title} wurde ausgeführt.`;
  }

  private antworte(
    conversationId: string,
    text: string,
    approvalId?: string,
  ): Result<{ antwort: string; agent: string; konversationId: string; freigabeEntschieden?: string }> {
    this.memory.appendAssistant(conversationId, text, 'JarvisCore');
    this.bus.emit('message', { conversationId, role: 'assistant', content: text, agent: 'JarvisCore' });
    this.bus.emit('speak', { text });
    return ok({
      antwort: text,
      agent: 'JarvisCore',
      konversationId: conversationId,
      ...(approvalId ? { freigabeEntschieden: approvalId } : {}),
    });
  }

  /**
   * Deutet eine Aeusserung als Zustimmung, Ablehnung oder nichts davon.
   *
   * Bewusst streng: alles, was nicht eindeutig ist, faellt auf 'keine' oder
   * 'schwach' zurueck und loest dann eine Rueckfrage aus.
   */
  interpretApprovalUtterance(text: string): ApprovalUtterance {
    const t = text.toLowerCase().trim().replace(/[!.]+$/, '');

    const nummer = /\bnummer\s+(\d{1,3})\b/.exec(t) ?? /^(\d{1,3})\s+(freigeben|senden|abschicken)/.exec(t);
    const n = nummer?.[1] ? Number.parseInt(nummer[1], 10) : undefined;

    const ablehnung = [
      'abbrechen', 'nicht senden', 'nicht freigeben', 'verwerfen', 'stopp', 'stop',
      'doch nicht', 'abgelehnt', 'ablehnen', 'lieber nicht', 'nein danke', 'nein',
    ];
    if (ablehnung.some((w) => t === w || t.startsWith(`${w} `) || t.includes(` ${w}`))) {
      return { art: 'ablehnung', staerke: 'stark', ...(n !== undefined ? { nummer: n } : {}) };
    }

    const stark = [
      'freigeben', 'freigabe erteilen', 'senden', 'sende', 'abschicken', 'schick sie ab',
      'mail abschicken', 'mail senden', 'jetzt senden', 'ja senden', 'ja, senden',
      'genau so senden', 'ja genau so senden', 'so senden', 'raus damit', 'versenden',
    ];
    if (stark.some((w) => t === w || t.includes(w))) {
      return { art: 'zustimmung', staerke: 'stark', ...(n !== undefined ? { nummer: n } : {}) };
    }

    const schwach = ['ja', 'ja bitte', 'okay', 'ok', 'passt', 'perfekt', 'gerne', 'mach das', 'einverstanden', 'in ordnung'];
    if (schwach.some((w) => t === w)) {
      return { art: 'zustimmung', staerke: 'schwach', ...(n !== undefined ? { nummer: n } : {}) };
    }

    return { art: 'keine', staerke: 'stark' };
  }

  // -------------------------------------------------------------------------
  // Abfragen fuer die Oberflaeche
  // -------------------------------------------------------------------------

  sendingCenter(campaignId?: string) {
    return this.repos.campaigns.overview(campaignId ? { campaignId } : {});
  }

  status() {
    const voice = this.voice.status();
    return {
      sprachmodell: {
        anbieter: this.baseContext.llm.id,
        modell: this.baseContext.llm.defaultModel,
        bereit: this.baseContext.llm.isConfigured(),
        hinweis: this.baseContext.llm.missingConfigHint(),
      },
      suche: { anbieter: this.research.providerLabel, hinweis: this.research.providerHint() },
      versand: this.mail.transportStatus(),
      posteingang: this.baseContext.mailReader
        ? {
            anbieter: this.baseContext.mailReader.id,
            bereit: this.baseContext.mailReader.isConfigured(),
            hinweis: this.baseContext.mailReader.missingConfigHint(),
          }
        : { anbieter: 'keiner', bereit: false, hinweis: 'Kein IMAP eingerichtet.' },
      spracheingabe: voice.stt,
      sprachausgabe: voice.tts,
      kalender: { bereit: this.baseContext.calendar.isConfigured(), anbieter: this.baseContext.calendar.label },
      versandlimits: this.baseContext.compliance.currentLimits,
      verzeichnisse: this.system.roots,
      datenverzeichnis: this.paths.dataDir,
      offeneFreigaben: this.approvals.pending().length,
    };
  }

  /**
   * Zahlen fuer die Kommandozentrale.
   *
   * Ausschliesslich echte Werte aus der Datenbank -- keine geschaetzten und
   * keine hochgerechneten. Was nicht gemessen wurde, steht auf 0.
   */
  dashboard(): DashboardDaten {
    const jetzt = Date.now();
    const seit = (ms: number) => new Date(jetzt - ms).toISOString();
    const limits = this.baseContext.compliance.currentLimits;
    const db = this.repos.db;

    const zaehle = (sql: string, ...params: unknown[]): number => {
      const row = db.prepare(sql).get(...(params as [])) as { n: number } | undefined;
      return row?.n ?? 0;
    };

    // Gesendete Mails je Tag, 14 Tage -- fehlende Tage werden mit 0 aufgefuellt,
    // sonst staucht die Sparkline die Zeitachse und luegt ueber den Verlauf.
    const proTag = new Map<string, number>();
    for (
      const row of db
        .prepare(
          `SELECT substr(sent_at, 1, 10) AS tag, COUNT(*) AS n
             FROM emails WHERE status = 'gesendet' AND sent_at >= ?
            GROUP BY tag`,
        )
        .all(seit(13 * 86_400_000)) as Array<{ tag: string; n: number }>
    ) {
      proTag.set(row.tag, row.n);
    }
    const verlauf: Array<{ tag: string; anzahl: number }> = [];
    for (let i = 13; i >= 0; i -= 1) {
      const tag = new Date(jetzt - i * 86_400_000).toISOString().slice(0, 10);
      verlauf.push({ tag, anzahl: proTag.get(tag) ?? 0 });
    }

    const s = this.status();

    return {
      wartetAufFreigabe: this.approvals.pending().length,
      kennzahlen: {
        unternehmen: zaehle('SELECT COUNT(*) AS n FROM companies'),
        mitVerifizierterAdresse: zaehle(
          `SELECT COUNT(DISTINCT company_id) AS n FROM email_addresses
            WHERE verification = 'VERIFIZIERT' AND company_id IS NOT NULL`,
        ),
        entwuerfe: zaehle(`SELECT COUNT(*) AS n FROM emails WHERE status = 'entwurf'`),
        gesendetGesamt: zaehle(`SELECT COUNT(*) AS n FROM emails WHERE status = 'gesendet'`),
        gesendet7Tage: zaehle(
          `SELECT COUNT(*) AS n FROM emails WHERE status = 'gesendet' AND sent_at >= ?`,
          seit(7 * 86_400_000),
        ),
        gesendetVorwoche: zaehle(
          `SELECT COUNT(*) AS n FROM emails WHERE status = 'gesendet' AND sent_at >= ? AND sent_at < ?`,
          seit(14 * 86_400_000),
          seit(7 * 86_400_000),
        ),
        antworten: zaehle(`SELECT COUNT(*) AS n FROM emails WHERE direction = 'eingehend'`),
        fehlgeschlagen: zaehle(`SELECT COUNT(*) AS n FROM emails WHERE status = 'fehlgeschlagen'`),
        offeneAufgaben: zaehle(`SELECT COUNT(*) AS n FROM tasks WHERE status = 'offen'`),
        kampagnen: zaehle('SELECT COUNT(*) AS n FROM outreach_campaigns'),
      },
      auslastung: {
        stunde: {
          verbraucht: this.repos.emails.countSentSince(seit(3_600_000)),
          grenze: limits.maxPerHour,
        },
        tag: {
          verbraucht: this.repos.emails.countSentSince(seit(86_400_000)),
          grenze: limits.maxPerDay,
        },
      },
      verlauf,
      bereitschaft: [
        { name: 'Sprachmodell', bereit: s.sprachmodell.bereit, detail: s.sprachmodell.modell },
        { name: 'Websuche', bereit: !s.suche.hinweis, detail: s.suche.anbieter },
        { name: 'Versandweg', bereit: s.versand.bereit, detail: s.versand.label },
        { name: 'Posteingang', bereit: s.posteingang.bereit, detail: s.posteingang.anbieter },
      ],
      aktivitaet: this.audit.list({ limit: 12 }).map((r) => ({
        id: r.id,
        zeit: r.ts,
        text: r.summary,
        fehler: r.outcome === 'fehler',
      })),
    };
  }

  /** Kontext fuer Tests und fuer die IPC-Schicht. */
  get context(): JarvisContext {
    return this.baseContext;
  }

  /** Mehrfaches Schliessen ist erlaubt und tut beim zweiten Mal nichts. */
  close(): void {
    if (this.geschlossen) return;
    this.geschlossen = true;
    this.audit.log({ actor: 'system', action: 'ende', summary: 'JARVIS beendet' });
    this.bus.removeAll();
    this.db.close();
  }
}

/** Was die Kommandozentrale anzeigt. */
export interface DashboardDaten {
  /** Die eine Zahl, mit der die Ansicht aufmacht. */
  wartetAufFreigabe: number;
  kennzahlen: {
    unternehmen: number;
    mitVerifizierterAdresse: number;
    entwuerfe: number;
    gesendetGesamt: number;
    gesendet7Tage: number;
    /** Die sieben Tage davor -- fuer den Vergleichswert der Kachel. */
    gesendetVorwoche: number;
    antworten: number;
    fehlgeschlagen: number;
    offeneAufgaben: number;
    kampagnen: number;
  };
  auslastung: {
    stunde: { verbraucht: number; grenze: number };
    tag: { verbraucht: number; grenze: number };
  };
  /** 14 Tage, lueckenlos, aelteste zuerst. */
  verlauf: Array<{ tag: string; anzahl: number }>;
  bereitschaft: Array<{ name: string; bereit: boolean; detail: string }>;
  aktivitaet: Array<{ id: string; zeit: string; text: string; fehler: boolean }>;
}

export interface ApprovalUtterance {
  art: 'zustimmung' | 'ablehnung' | 'keine';
  /** 'schwach' = nur gueltig direkt nach einer Rueckfrage. */
  staerke: 'stark' | 'schwach';
  nummer?: number;
}
