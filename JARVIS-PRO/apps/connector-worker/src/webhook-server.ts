import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Clock, InboundEvent, InboundEventDraft } from '@jarvis/domain';
import { ReplayGuard, verifyMetaChallenge, verifyMetaSignature, type SecretStore } from '@jarvis/security';
import { metrics, type Logger } from '@jarvis/observability';
import type { EventStore } from '@jarvis/storage';
import { WhatsAppWebhookSchema, parseWhatsAppWebhook } from '@jarvis/connectors';

/**
 * Webhook-Endpunkt fuer die WhatsApp Business Cloud API.
 *
 * Die Reihenfolge der Pruefungen ist Absicht und darf nicht geaendert werden:
 *
 *  1. Groesse begrenzen  - bevor irgendetwas gelesen wird.
 *  2. Signatur pruefen   - ueber den ROHEN Body. Wird vorher geparst und neu
 *                          serialisiert, stimmt die Signatur nicht mehr, und
 *                          schlimmer: man haette dann ungeprueften Input
 *                          verarbeitet.
 *  3. Schema pruefen     - was nicht passt, wird nicht angefasst.
 *  4. Replay abweisen    - dieselbe Nachrichten-ID zaehlt nur einmal.
 *  5. Erst dann speichern und einen Anruf-Job erzeugen.
 *
 * Geantwortet wird immer schnell mit 200, sobald die Nutzlast angenommen ist.
 * Meta wiederholt sonst die Zustellung - und die Verarbeitung eines Ereignisses
 * kann einen Anruf ausloesen, der Minuten dauert.
 */
export interface WebhookServerConfig {
  readonly port: number;
  readonly host?: string;
  readonly path?: string;
  readonly phoneNumberId: string;
  readonly maxBodyBytes?: number;
  /**
   * Noahs eigene WhatsApp-Nummer.
   *
   * Ohne diese Trennung landet jede Nachricht, die Noah an Jarvis schreibt,
   * als "neues Ereignis" im Speicher - und Jarvis meldet ihm zurueck, dass
   * er selbst geschrieben hat. Was von dieser Nummer kommt, ist Bedienung
   * und kein Vorgang.
   */
  readonly ownerWaId?: string;
}

export interface WebhookServerDeps {
  readonly config: WebhookServerConfig;
  readonly secrets: SecretStore;
  readonly events: EventStore;
  readonly logger: Logger;
  readonly clock: Clock;
  /** Wird fuer jedes neue, nicht duplizierte Ereignis aufgerufen. */
  readonly onEvent: (event: InboundEvent) => void;
  /**
   * Wird fuer Nachrichten von Noah selbst aufgerufen - das ist die Bedienung
   * von Jarvis. Fehlt der Rueckruf, werden solche Nachrichten verworfen
   * statt als Ereignis abgelegt.
   */
  readonly onOwnerMessage?: (waId: string, text: string) => void;
  /** Zustellstatus der eigenen Nachrichten - nur fuer die Diagnose. */
  readonly onStatus?: (status: { id: string; status: string; recipientId: string }) => void;
}

const DEFAULT_MAX_BODY = 1024 * 1024;

export class WhatsAppWebhookServer {
  private server: Server | null = null;
  private readonly replay: ReplayGuard;

  constructor(private readonly deps: WebhookServerDeps) {
    this.replay = new ReplayGuard(deps.clock);
  }

  async start(): Promise<void> {
    const path = this.deps.config.path ?? '/webhook/whatsapp';
    this.server = createServer((req, res) => {
      void this.handle(req, res, path).catch((err: unknown) => {
        this.deps.logger.error('webhook_fehler', {
          error: err instanceof Error ? err.message : String(err),
        });
        if (!res.headersSent) res.writeHead(500).end();
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.deps.config.port, this.deps.config.host ?? '127.0.0.1', () => {
        this.deps.logger.info('webhook_lauscht', {
          port: this.deps.config.port,
          path,
        });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.server === null) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
    this.server = null;
  }

  private async handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== path) {
      res.writeHead(404).end();
      return;
    }

    if (req.method === 'GET') {
      await this.handleVerification(url, res);
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }

    const raw = await readBody(req, this.deps.config.maxBodyBytes ?? DEFAULT_MAX_BODY);
    if (raw === null) {
      this.deps.logger.warn('webhook_body_zu_gross', {});
      res.writeHead(413).end();
      return;
    }

    // Signatur ueber den ROHEN Body.
    const appSecret = (await this.deps.secrets.get('whatsapp-app-secret')) ?? '';
    const signature = verifyMetaSignature(raw, req.headers['x-hub-signature-256'] as string | undefined, appSecret);
    if (!signature.valid) {
      this.deps.logger.warn('webhook_signatur_ungueltig', { reason: signature.reason });
      res.writeHead(401).end();
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw.toString('utf8'));
    } catch {
      res.writeHead(400).end();
      return;
    }

    const validated = WhatsAppWebhookSchema.safeParse(parsedJson);
    if (!validated.success) {
      this.deps.logger.warn('webhook_schema_ungueltig', {
        problems: validated.error.issues.slice(0, 5).map((i) => i.path.join('.')),
      });
      // 200 statt 400: eine Nutzlast, die wir nicht verstehen, soll Meta nicht
      // in eine Wiederholungsschleife schicken.
      res.writeHead(200).end('ok');
      return;
    }

    // Schnell antworten - die Verarbeitung darf die Zustellung nicht aufhalten.
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');

    const { events, statuses, ignored } = parseWhatsAppWebhook(validated.data, this.deps.config.phoneNumberId);
    if (ignored > 0) this.deps.logger.debug('webhook_eintraege_ignoriert', { ignored });

    for (const s of statuses) this.deps.onStatus?.(s);

    for (const draft of events) {
      this.ingest(draft);
    }
  }

  /**
   * Nimmt ein Ereignis an. Der Replay-Schutz im Speicher faengt den schnellen
   * Doppelschlag ab, die Deduplizierung im Eventstore den nach einem Neustart -
   * beide zusammen ergeben genau einen Anruf je Nachricht.
   */
  private ingest(draft: InboundEventDraft): void {
    if (!this.replay.accept(draft.providerId)) {
      metrics.duplicatesDropped.inc({ channel: 'whatsapp', quelle: 'replay' });
      this.deps.logger.info('webhook_duplikat_verworfen', { providerId: draft.providerId });
      return;
    }

    // Bedienung statt Vorgang: was von Noah kommt, geht in den
    // Gespraechsablauf und nicht in den Ereignisspeicher.
    const owner = this.deps.config.ownerWaId;
    if (owner !== undefined && sameNumber(draft.senderAddress, owner)) {
      // `preview` ist bei Text identisch mit `body` und nie null - ein Bild
      // ohne Bildunterschrift kommt hier als "[Bild]" an, und das ist als
      // Bedienbefehl genau richtig unverstaendlich.
      const text = draft.body ?? draft.preview;
      this.deps.logger.info('webhook_nachricht_vom_eigentuemer', { laenge: text.length });
      this.deps.onOwnerMessage?.(draft.senderAddress, text);
      return;
    }

    const { event, isNew } = this.deps.events.ingest(draft);
    if (!isNew) {
      metrics.duplicatesDropped.inc({ channel: 'whatsapp', quelle: 'eventstore' });
      return;
    }
    this.deps.onEvent(event);
  }

  private async handleVerification(url: URL, res: ServerResponse): Promise<void> {
    const expected = (await this.deps.secrets.get('whatsapp-verify-token')) ?? '';
    const result = verifyMetaChallenge(
      {
        mode: url.searchParams.get('hub.mode') ?? undefined,
        token: url.searchParams.get('hub.verify_token') ?? undefined,
        challenge: url.searchParams.get('hub.challenge') ?? undefined,
      },
      expected,
    );
    if (!result.ok) {
      this.deps.logger.warn('webhook_verifikation_abgelehnt', {});
      res.writeHead(403).end();
      return;
    }
    this.deps.logger.info('webhook_verifiziert', {});
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(result.echo ?? '');
  }
}

/** Liest den Body mit harter Groessengrenze. `null` bedeutet: zu gross. */
async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Nummernvergleich ohne Plus, Leerzeichen und Bindestriche. */
function sameNumber(a: string, b: string): boolean {
  const links = a.replace(/\D/g, '');
  const rechts = b.replace(/\D/g, '');
  return links.length > 0 && links === rechts;
}
