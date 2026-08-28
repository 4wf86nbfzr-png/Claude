import { z } from 'zod';
import type { Clock, InboundEventDraft, OutboundDraft } from '@jarvis/domain';
import type { Logger } from '@jarvis/observability';
import type { SecretStore } from '@jarvis/security';
import { HttpClient } from '../http.js';
import { ConnectorError, type MessagingConnector, type SendResult } from '../types.js';

/**
 * WhatsApp Business Cloud API - direkt bei Meta.
 *
 * Kein Business Solution Provider, keine Automatisierung von WhatsApp Web,
 * keine Desktop-Steuerung, keine inoffizielle Bibliothek. Der einzige Weg
 * hinaus ist ein POST auf den Nachrichten-Endpunkt der eigenen Phone Number ID.
 *
 * Zwei Dinge, die man bei WhatsApp Business kennen muss und die im Betrieb
 * regelmaessig fuer Ueberraschungen sorgen:
 *
 *  1. Das Kundendienstfenster. Frei formulierten Text darf ein Unternehmen
 *     nur innerhalb eines begrenzten Zeitraums nach der letzten Nachricht des
 *     Kunden senden. Danach sind nur noch vorab genehmigte Vorlagen zulaessig.
 *     Der Adapter fuehrt deshalb Buch darueber, wann ein Chat zuletzt etwas
 *     geschickt hat, und meldet einen Versand ausserhalb des Fensters als
 *     Fehler, statt ihn beim Provider auflaufen zu lassen. Die genaue Dauer
 *     legt Meta fest und hat sie in der Vergangenheit geaendert - sie steht
 *     deshalb in der Konfiguration, nicht im Code.
 *  2. Rueckwirkender Abruf gibt es nicht. Nachrichten, die vor der Anbindung
 *     in der WhatsApp-Business-App angekommen sind, lassen sich ueber die
 *     Cloud API NICHT nachtraeglich holen. Jarvis kennt nur, was ab der
 *     Anbindung ueber den Webhook hereinkommt.
 *
 * STATUS: unverified. Endpunkt, Nutzlastform und Feldnamen sind gegen die
 * offizielle Dokumentation angelegt; graph.facebook.com ist in dieser
 * Umgebung vom Netzwerk-Proxy gesperrt, ein Live-Test war nicht moeglich.
 * Zu pruefen vor dem ersten Einsatz: `docs/api-annahmen.md`.
 */

export interface WhatsAppConfig {
  readonly phoneNumberId: string;
  readonly wabaId: string;
  /** Graph-Version, z. B. 'v23.0'. Gehoert in die Konfiguration, nicht in den Code. */
  readonly graphVersion: string;
  /** Laenge des Kundendienstfensters in Stunden. Von Meta vorgegeben. */
  readonly serviceWindowHours: number;
  readonly baseUrl?: string;
}

export interface WhatsAppDeps {
  readonly config: WhatsAppConfig;
  readonly secrets: SecretStore;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly fetchImpl?: typeof fetch;
  /** Zeitpunkt der letzten eingehenden Nachricht eines Chats. */
  readonly lastInboundAt: (waId: string) => string | null;
}

const ACCESS_TOKEN_KEY = 'whatsapp-access-token';

interface SendResponse {
  messaging_product?: string;
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string; message_status?: string }[];
}

export class WhatsAppCloudConnector implements MessagingConnector {
  readonly name = 'whatsapp-cloud-api';
  readonly account: string;
  private readonly http: HttpClient;

  constructor(private readonly deps: WhatsAppDeps) {
    this.account = deps.config.phoneNumberId;
    const base = deps.config.baseUrl ?? `https://graph.facebook.com/${deps.config.graphVersion}`;
    this.http = new HttpClient(base, {
      logger: deps.logger,
      accessToken: async () => {
        const token = await deps.secrets.get(ACCESS_TOKEN_KEY);
        if (token === null) {
          throw new ConnectorError(
            'Kein WhatsApp-Zugangstoken hinterlegt. Bitte "pnpm connect:whatsapp" ausfuehren.',
            'auth',
            false,
          );
        }
        return token;
      },
      ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
    });
  }

  /**
   * Prueft, ob freier Text an diesen Chat gerade zulaessig ist.
   * Ausserhalb des Fensters waere nur eine genehmigte Vorlage erlaubt -
   * und die wuerde Jarvis nicht ohne Weiteres richtig treffen.
   */
  isWithinServiceWindow(waId: string): { allowed: boolean; reason: string | null } {
    const last = this.deps.lastInboundAt(waId);
    if (last === null) {
      return {
        allowed: false,
        reason:
          'Von dieser Nummer liegt keine eingehende Nachricht vor. Freier Text ist dann nicht zulaessig; ' +
          'dafuer braeuchte es eine genehmigte Vorlage.',
      };
    }
    const ageHours = (this.deps.clock.now().getTime() - Date.parse(last)) / 3_600_000;
    if (ageHours > this.deps.config.serviceWindowHours) {
      return {
        allowed: false,
        reason:
          `Die letzte Nachricht aus diesem Chat ist ${Math.floor(ageHours)} Stunden alt. ` +
          `Das Antwortfenster von ${this.deps.config.serviceWindowHours} Stunden ist zu. ` +
          'Freier Text ist jetzt nicht mehr zulaessig.',
      };
    }
    return { allowed: true, reason: null };
  }

  async send(draft: OutboundDraft, idempotencyKey: string): Promise<SendResult> {
    const to = normalizeWaId(draft.recipient);

    const window = this.isWithinServiceWindow(to);
    if (!window.allowed) {
      // Kein Versuch beim Provider: das waere ein absehbarer Fehlschlag.
      return { status: 'failed', providerMessageId: null, error: window.reason };
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: draft.body },
    };

    try {
      const res = await this.http.post<SendResponse>(
        `/${encodeURIComponent(this.deps.config.phoneNumberId)}/messages`,
        payload,
        { maxRetries: 0, retryOnServerError: false },
      );
      const id = res.data.messages?.[0]?.id;
      if (id === undefined) {
        // Antwort ohne Nachrichten-ID: nicht als Erfolg werten.
        return {
          status: 'unknown',
          providerMessageId: null,
          error: 'Antwort ohne Nachrichten-ID',
        };
      }
      this.deps.logger.info('whatsapp_gesendet', { idempotencyKey, providerMessageId: id });
      return { status: 'sent', providerMessageId: id, error: null };
    } catch (err) {
      if (err instanceof ConnectorError && (err.kind === 'network' || err.kind === 'server')) {
        return { status: 'unknown', providerMessageId: null, error: err.message };
      }
      return {
        status: 'failed',
        providerMessageId: null,
        error: err instanceof Error ? err.message : 'unbekannter Fehler',
      };
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      if ((await this.deps.secrets.get(ACCESS_TOKEN_KEY)) === null) {
        return { ok: false, message: 'WhatsApp ist noch nicht verbunden (pnpm connect:whatsapp).' };
      }
      await this.http.get(`/${encodeURIComponent(this.deps.config.phoneNumberId)}?fields=display_phone_number`, {
        maxRetries: 1,
      });
      return { ok: true, message: `WhatsApp Cloud API erreichbar (${this.deps.config.phoneNumberId})` };
    } catch (err) {
      return {
        ok: false,
        message: `WhatsApp Cloud API nicht erreichbar: ${err instanceof Error ? err.message : 'unbekannt'}`,
      };
    }
  }
}

/** Meta erwartet die Nummer ohne fuehrendes Plus und ohne Trennzeichen. */
export function normalizeWaId(recipient: string): string {
  return recipient.replace(/\D/g, '');
}

/* -------------------------------------------------------------------------- */
/* Webhook-Nutzlast                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Strikte Schema-Validierung der Webhook-Nutzlast.
 *
 * Bewusst streng: was nicht passt, wird nicht verarbeitet. Ein Webhook ist
 * ein Endpunkt, den jeder aufrufen kann - die Signaturpruefung sitzt davor,
 * aber ein zweites Netz kostet nichts.
 */
export const WhatsAppTextSchema = z.object({ body: z.string() });

export const WhatsAppMessageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string(),
  type: z.string(),
  text: WhatsAppTextSchema.optional(),
  image: z.object({ id: z.string(), caption: z.string().optional(), mime_type: z.string().optional() }).optional(),
  document: z
    .object({ id: z.string(), filename: z.string().optional(), mime_type: z.string().optional() })
    .optional(),
  audio: z.object({ id: z.string(), mime_type: z.string().optional() }).optional(),
  video: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
  context: z.object({ from: z.string().optional(), id: z.string().optional() }).optional(),
});

export const WhatsAppValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: z.object({ display_phone_number: z.string(), phone_number_id: z.string() }),
  contacts: z.array(z.object({ profile: z.object({ name: z.string() }).optional(), wa_id: z.string() })).optional(),
  messages: z.array(WhatsAppMessageSchema).optional(),
  statuses: z
    .array(z.object({ id: z.string(), status: z.string(), timestamp: z.string(), recipient_id: z.string() }))
    .optional(),
  errors: z.array(z.object({ code: z.number(), title: z.string() })).optional(),
});

export const WhatsAppWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(z.object({ field: z.string(), value: WhatsAppValueSchema })),
    }),
  ),
});

export type WhatsAppWebhookPayload = z.infer<typeof WhatsAppWebhookSchema>;

export interface ParsedWebhook {
  readonly events: InboundEventDraft[];
  /** Zustellstatus der eigenen Nachrichten - fuer die Diagnose, nie fuer einen Anruf. */
  readonly statuses: { id: string; status: string; recipientId: string }[];
  readonly ignored: number;
}

/**
 * Wandelt eine Webhook-Nutzlast in Ereignisse.
 *
 * Statusmeldungen zu eigenen Nachrichten erzeugen ausdruecklich KEIN Ereignis -
 * sonst riefe Jarvis sich selbst hinterher, weil seine eigene Antwort
 * zugestellt wurde.
 */
export function parseWhatsAppWebhook(
  payload: WhatsAppWebhookPayload,
  ownPhoneNumberId: string,
): ParsedWebhook {
  const events: InboundEventDraft[] = [];
  const statuses: { id: string; status: string; recipientId: string }[] = [];
  let ignored = 0;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      if (value.metadata.phone_number_id !== ownPhoneNumberId) {
        ignored += 1;
        continue;
      }

      for (const s of value.statuses ?? []) {
        statuses.push({ id: s.id, status: s.status, recipientId: s.recipient_id });
      }

      for (const m of value.messages ?? []) {
        const contact = value.contacts?.find((c) => c.wa_id === m.from);
        const preview = describeMessage(m);
        if (preview === null) {
          ignored += 1;
          continue;
        }
        events.push({
          channel: 'whatsapp',
          providerId: m.id,
          providerAccount: value.metadata.phone_number_id,
          threadId: m.from,
          senderDisplay: contact?.profile?.name ?? m.from,
          senderAddress: m.from,
          subject: null,
          preview: preview.slice(0, 4000),
          body: preview,
          receivedAt: epochToIso(m.timestamp),
          urgency: 'normal',
          attachments: attachmentsOf(m),
          selfOriginated: false,
        });
      }
    }
  }

  return { events, statuses, ignored };
}

function describeMessage(m: z.infer<typeof WhatsAppMessageSchema>): string | null {
  if (m.text?.body !== undefined) return m.text.body;
  if (m.image !== undefined) return `[Bild]${m.image.caption === undefined ? '' : ` ${m.image.caption}`}`;
  if (m.video !== undefined) return `[Video]${m.video.caption === undefined ? '' : ` ${m.video.caption}`}`;
  if (m.document !== undefined) return `[Dokument] ${m.document.filename ?? 'ohne Namen'}`;
  if (m.audio !== undefined) return '[Sprachnachricht]';
  // Reaktionen, Systemmeldungen und alles Unbekannte loesen keinen Anruf aus.
  return null;
}

function attachmentsOf(m: z.infer<typeof WhatsAppMessageSchema>): InboundEventDraft['attachments'] {
  if (m.document !== undefined) {
    return [
      {
        name: m.document.filename ?? 'dokument',
        mimeType: m.document.mime_type ?? 'application/octet-stream',
        sizeBytes: 0,
        providerAttachmentId: m.document.id,
      },
    ];
  }
  if (m.image !== undefined) {
    return [
      {
        name: 'bild',
        mimeType: m.image.mime_type ?? 'image/jpeg',
        sizeBytes: 0,
        providerAttachmentId: m.image.id,
      },
    ];
  }
  return [];
}

function epochToIso(timestamp: string): string {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}
