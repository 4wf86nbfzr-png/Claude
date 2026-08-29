import type { Channel, OutboundDraft } from '@jarvis/domain';

/**
 * Der Versandweg.
 *
 * Die Registry ist der einzige Ort im System, an dem eine echte
 * Provider-Sendefunktion liegt. Sie ist ausschliesslich der Approval Engine
 * bekannt: das Sprachmodell bekommt weder dieses Modul noch ein Tool, das
 * darauf zeigt. Selbst ein vollstaendig uebernommenes Modell kann von hier
 * aus nichts ausloesen, weil ihm der Aufrufpfad fehlt.
 */
export interface SendOutcome {
  /** 'sent' nur, wenn der Provider den Versand bestaetigt hat. */
  readonly status: 'sent' | 'failed' | 'unknown';
  readonly providerMessageId: string | null;
  readonly error: string | null;
}

export interface ChannelSender {
  readonly channel: Channel;
  /**
   * Sendet. `idempotencyKey` muss vom Provider oder vom Adapter beachtet
   * werden - ein Retry darf keine zweite Nachricht erzeugen.
   */
  send(draft: OutboundDraft, idempotencyKey: string): Promise<SendOutcome>;
}

export class SenderRegistry {
  private readonly senders = new Map<Channel, ChannelSender>();

  register(sender: ChannelSender): this {
    this.senders.set(sender.channel, sender);
    return this;
  }

  get(channel: Channel): ChannelSender | null {
    return this.senders.get(channel) ?? null;
  }

  has(channel: Channel): boolean {
    return this.senders.has(channel);
  }

  channels(): Channel[] {
    return [...this.senders.keys()];
  }
}

/**
 * Dry-Run-Sender. Protokolliert, was gesendet WUERDE, und sendet nichts.
 * Das ist der Standard, bis eine reale Integration einzeln freigeschaltet wird.
 */
export class DryRunSender implements ChannelSender {
  readonly attempts: { draft: OutboundDraft; idempotencyKey: string }[] = [];

  constructor(readonly channel: Channel) {}

  async send(draft: OutboundDraft, idempotencyKey: string): Promise<SendOutcome> {
    this.attempts.push({ draft, idempotencyKey });
    return {
      status: 'sent',
      providerMessageId: `dryrun-${idempotencyKey.slice(0, 24)}`,
      error: null,
    };
  }
}
