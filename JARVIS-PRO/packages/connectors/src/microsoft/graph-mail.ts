import type { Clock, InboundEventDraft, OutboundDraft } from '@jarvis/domain';
import type { Logger } from '@jarvis/observability';
import { HttpClient } from '../http.js';
import { ConnectorError, type MailConnector, type SendResult } from '../types.js';
import { MS_ENDPOINTS, type MicrosoftOAuth } from './oauth.js';

/**
 * Microsoft-Graph-Adapter fuer Noahs geschaeftliches Postfach.
 *
 * Neue Nachrichten kommen ueber die Delta-Abfrage. Warum Delta und nicht
 * Change Notifications als Standard: eine Webhook-Zustellung braucht einen
 * von aussen erreichbaren HTTPS-Endpunkt. Den gibt es bei einem Rechner im
 * Buero nicht ohne zusaetzliche Freigabe, und ein Ausfall des Endpunkts
 * wuerde Nachrichten verschlucken. Die Delta-Abfrage kommt ohne aus, holt
 * nach einem Ausfall alles nach und ist damit die sichere Grundeinstellung.
 * Change Notifications lassen sich zusaetzlich einschalten, sobald ein
 * sicherer Endpunkt existiert - die Deduplizierung im Eventstore sorgt
 * dafuer, dass beide Wege zusammen keine doppelten Anrufe erzeugen.
 *
 * STATUS: unverified. Endpunktpfade und Feldnamen sind gegen die offizielle
 * Dokumentation angelegt; ein Live-Abgleich war hier nicht moeglich, weil
 * graph.microsoft.com vom Netzwerk-Proxy gesperrt ist. Zu pruefen vor dem
 * ersten Einsatz: `docs/api-annahmen.md`.
 */

/** Alle Pfade an einer Stelle. */
export const GRAPH_PATHS = {
  /** Delta-Abfrage auf den Posteingang. Der erste Aufruf liefert den Ausgangsstand. */
  inboxDelta: "/me/mailFolders('inbox')/messages/delta",
  message: (id: string) => `/me/messages/${encodeURIComponent(id)}`,
  sendMail: '/me/sendMail',
  createReply: (id: string) => `/me/messages/${encodeURIComponent(id)}/createReply`,
  sendDraft: (id: string) => `/me/messages/${encodeURIComponent(id)}/send`,
} as const;

interface GraphMessage {
  id: string;
  subject?: string | null;
  bodyPreview?: string;
  receivedDateTime?: string;
  conversationId?: string | null;
  importance?: 'low' | 'normal' | 'high';
  isDraft?: boolean;
  hasAttachments?: boolean;
  from?: { emailAddress?: { name?: string; address?: string } };
  sender?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
  '@removed'?: unknown;
}

interface DeltaResponse {
  value: GraphMessage[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

export interface GraphMailDeps {
  readonly oauth: MicrosoftOAuth;
  readonly logger: Logger;
  readonly clock: Clock;
  /** Speichert und liest den Delta-Link ueber Neustarts hinweg. */
  readonly loadDeltaLink: () => string | null;
  readonly saveDeltaLink: (link: string | null) => void;
  readonly account: string;
  readonly fetchImpl?: typeof fetch;
  /** Absenderadressen, die Jarvis selbst benutzt - loesen nie einen Anruf aus. */
  readonly ownAddresses?: readonly string[];
  readonly pageSize?: number;
}

export class GraphMailConnector implements MailConnector {
  readonly name = 'microsoft-graph-mail';
  readonly account: string;
  private readonly http: HttpClient;

  constructor(private readonly deps: GraphMailDeps) {
    this.account = deps.account;
    this.http = new HttpClient(MS_ENDPOINTS.graphBase, {
      logger: deps.logger,
      accessToken: (force) => deps.oauth.getAccessToken(force),
      ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
    });
  }

  /**
   * Holt alle Aenderungen seit dem letzten Abgleich.
   *
   * Der gespeicherte Delta-Link wird verbatim weiterverwendet - er traegt
   * die Abfrageparameter bereits in sich, und selbst gebaute Links sind der
   * haeufigste Grund dafuer, dass ein Delta-Abgleich stillschweigend von
   * vorn anfaengt.
   *
   * Der Link wird erst NACH der Verarbeitung gespeichert. Stirbt der Prozess
   * mittendrin, wird die Seite beim naechsten Mal erneut geliefert - und die
   * Deduplizierung im Eventstore faengt das ab. Andersherum waeren die
   * Nachrichten weg.
   */
  async fetchNew(): Promise<InboundEventDraft[]> {
    const stored = this.deps.loadDeltaLink();
    let next: string = stored ?? `${GRAPH_PATHS.inboxDelta}?$select=${SELECT_FIELDS}`;
    const collected: InboundEventDraft[] = [];
    let newDeltaLink: string | null = null;
    let pages = 0;

    while (pages < 50) {
      pages += 1;
      const res = await this.http.get<DeltaResponse>(next, {
        headers: { Prefer: `odata.maxpagesize=${this.deps.pageSize ?? 50}` },
      });

      for (const m of res.data.value) {
        if (m['@removed'] !== undefined) continue;
        if (m.isDraft === true) continue;
        const draft = this.toEventDraft(m);
        if (draft !== null) collected.push(draft);
      }

      const nextLink = res.data['@odata.nextLink'];
      const deltaLink = res.data['@odata.deltaLink'];
      if (typeof nextLink === 'string') {
        next = nextLink;
        continue;
      }
      if (typeof deltaLink === 'string') newDeltaLink = deltaLink;
      break;
    }

    if (pages >= 50) {
      this.deps.logger.warn('delta_seiten_limit_erreicht', { pages });
    }

    // Beim allerersten Lauf steht der Posteingang voll - das sind keine
    // "neuen" Nachrichten und darf keine Anrufwelle ausloesen.
    if (stored === null) {
      this.deps.logger.info('delta_ausgangsstand_gesetzt', { skipped: collected.length });
      this.deps.saveDeltaLink(newDeltaLink);
      return [];
    }

    this.deps.saveDeltaLink(newDeltaLink ?? stored);
    return collected;
  }

  private toEventDraft(m: GraphMessage): InboundEventDraft | null {
    const from = m.from?.emailAddress ?? m.sender?.emailAddress;
    const address = (from?.address ?? '').toLowerCase();
    if (address.length === 0) return null;

    const own = (this.deps.ownAddresses ?? [this.account]).map((a) => a.toLowerCase());
    const selfOriginated = own.includes(address);

    return {
      channel: 'email',
      providerId: m.id,
      providerAccount: this.account,
      threadId: m.conversationId ?? null,
      senderDisplay: from?.name ?? address,
      senderAddress: address,
      subject: m.subject ?? null,
      preview: (m.bodyPreview ?? '').slice(0, 4000),
      body: null,
      receivedAt: m.receivedDateTime ?? this.deps.clock.nowIso(),
      urgency: m.importance === 'high' ? 'high' : m.importance === 'low' ? 'low' : 'normal',
      attachments: [],
      selfOriginated,
    };
  }

  /** Vollstaendiger Text, erst wenn Noah ihn hoeren will. */
  async fetchBody(providerId: string): Promise<string | null> {
    const res = await this.http.get<GraphMessage>(
      `${GRAPH_PATHS.message(providerId)}?$select=body,bodyPreview`,
    );
    const body = res.data.body;
    if (body?.content === undefined) return res.data.bodyPreview ?? null;
    return body.contentType?.toLowerCase() === 'html' ? htmlToText(body.content) : body.content;
  }

  /**
   * Sendet. Wird ausschliesslich von der Approval Engine aufgerufen.
   *
   * Graph kennt keinen Idempotenzschluessel fuer sendMail. Deshalb gilt:
   * KEINE automatische Wiederholung bei einem Fehler nach dem Absenden - eine
   * Antwort, die nie ankam, kann trotzdem versendet worden sein. Der Aufrufer
   * bekommt in dem Fall `unknown`, und Jarvis sagt Noah genau das.
   */
  async send(draft: OutboundDraft, idempotencyKey: string): Promise<SendResult> {
    const message = {
      subject: draft.subject ?? '',
      body: { contentType: 'Text', content: draft.body },
      toRecipients: [{ emailAddress: { address: draft.recipient } }],
      // Der Idempotenzschluessel wandert als Kopfzeile mit. Er verhindert
      // nichts bei Graph, macht aber im Postausgang nachvollziehbar, welcher
      // Freigabevorgang zu welcher Nachricht gehoert.
      internetMessageHeaders: [
        { name: 'X-Jarvis-Approval', value: idempotencyKey.slice(0, 60) },
      ],
    };

    try {
      await this.http.post(GRAPH_PATHS.sendMail, { message, saveToSentItems: true }, {
        maxRetries: 0,
        retryOnServerError: false,
      });
    } catch (err) {
      if (err instanceof ConnectorError && (err.kind === 'network' || err.kind === 'server')) {
        // Hier ist wirklich unklar, ob die Nachricht raus ist.
        return { status: 'unknown', providerMessageId: null, error: err.message };
      }
      return {
        status: 'failed',
        providerMessageId: null,
        error: err instanceof Error ? err.message : 'unbekannter Fehler',
      };
    }

    // sendMail liefert 202 ohne Nachrichten-ID. Der Idempotenzschluessel ist
    // die einzige stabile Kennung, die wir haben - sie steht auch in der
    // Kopfzeile der gesendeten Nachricht.
    return { status: 'sent', providerMessageId: `graph-sent:${idempotencyKey.slice(0, 24)}`, error: null };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      if (!(await this.deps.oauth.isConnected())) {
        return { ok: false, message: 'Microsoft 365 ist noch nicht verbunden (pnpm connect:microsoft).' };
      }
      await this.http.get('/me?$select=id', { maxRetries: 1 });
      return { ok: true, message: `Microsoft Graph erreichbar, Postfach ${this.account}` };
    } catch (err) {
      return {
        ok: false,
        message: `Microsoft Graph nicht erreichbar: ${err instanceof Error ? err.message : 'unbekannt'}`,
      };
    }
  }
}

const SELECT_FIELDS =
  'id,subject,bodyPreview,receivedDateTime,conversationId,importance,isDraft,hasAttachments,from,sender';

/**
 * Wandelt HTML-Mail in vorlesbaren Text.
 * Bewusst simpel und ohne Parser-Abhaengigkeit: Skripte und Stile fliegen
 * raus, Blockelemente werden zu Zeilenumbruechen, Entities werden aufgeloest.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&auml;/gi, 'ä')
    .replace(/&ouml;/gi, 'ö')
    .replace(/&uuml;/gi, 'ü')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/gi, 'ß')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
