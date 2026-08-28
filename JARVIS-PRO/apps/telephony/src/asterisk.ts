import { createServer, type Server as NetServer, type Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import type { CallEndReason, Clock, E164 } from '@jarvis/domain';
import type { Logger } from '@jarvis/observability';
import {
  TELEPHONY_SAMPLE_RATE,
  bufferToPcm16,
  decodeG711,
  encodeG711,
  pcm16ToBuffer,
} from '@jarvis/speech';
import type { AnswerResult, CallHandle, TelephonyConfig, TelephonyPort } from './port.js';

/**
 * Asterisk-Adapter ueber ARI (Asterisk REST Interface) und Stasis.
 *
 * Ablauf:
 *  - Eine WebSocket-Verbindung nach `/ari/events` liefert die Ereignisse
 *    (StasisStart, ChannelDtmfReceived, StasisEnd, ...).
 *  - Steuerbefehle gehen als REST-Aufrufe nach `/ari/channels/...`.
 *  - Fuer Audio wird ein `externalMedia`-Kanal erzeugt und mit dem Anrufkanal
 *    in einer Bridge zusammengefuehrt. Asterisk schickt das Gespraechsaudio
 *    dann an unseren Prozess und nimmt von dort Audio entgegen.
 *
 * Zum Transport: `externalMedia` kann per RTP/UDP oder ueber AudioSocket
 * (TCP) arbeiten. Dieser Adapter implementiert AudioSocket, weil es
 * verbindungsorientiert ist, die Zuordnung Kanal-zu-Verbindung ueber eine UUID
 * im Protokoll mitliefert und dadurch ohne Portverwaltung pro Anruf auskommt.
 * Ein WebSocket-Transport ist in aktuellen Asterisk-Versionen nicht fuer
 * externalMedia vorgesehen; die Konfigurationsvariable
 * ARI_EXTERNAL_MEDIA_TRANSPORT bleibt deshalb auf 'audiosocket', bis
 * gegenteilige Angaben aus der Dokumentation der tatsaechlich installierten
 * Version vorliegen.
 *
 * STATUS: unverified. Dieser Adapter ist gegen die ARI- und
 * AudioSocket-Protokollbeschreibung geschrieben, aber noch nie gegen eine
 * laufende Asterisk-Instanz getestet - in dieser Umgebung ist keine
 * installiert. Der Simulator deckt den Gespraechsablauf ab; dieser Adapter
 * gilt erst nach einem echten Testanruf als bestaetigt.
 */

export interface AsteriskConfig extends TelephonyConfig {
  readonly ariUrl: string;
  readonly ariUser: string;
  readonly ariPassword: string;
  readonly appName: string;
  /** Endpoint des Trunks zum GSM-Gateway, z. B. 'PJSIP/gsm-gateway'. */
  readonly trunkEndpoint: string;
  /** Host:Port, auf dem dieser Prozess AudioSocket-Verbindungen annimmt. */
  readonly audioSocketBind: { host: string; port: number };
  /** Codec auf der Telefonstrecke. In Deutschland A-law. */
  readonly codec: 'alaw' | 'ulaw';
  readonly logger: Logger;
  readonly clock: Clock;
}

interface AriEvent {
  type: string;
  channel?: { id: string; caller?: { number?: string; name?: string }; state?: string };
  digit?: string;
  args?: string[];
}

/* -------------------------------------------------------------------------- */
/* AudioSocket                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * AudioSocket-Rahmen: 1 Byte Typ, 2 Byte Laenge (big endian), dann Nutzdaten.
 *   0x00 beenden, 0x01 UUID (16 Byte), 0x10 Audio (SLIN 8 kHz), 0xff Fehler.
 */
const AS_TYPE_TERMINATE = 0x00;
const AS_TYPE_UUID = 0x01;
const AS_TYPE_AUDIO = 0x10;
const AS_TYPE_ERROR = 0xff;

class AudioSocketConnection extends EventEmitter {
  uuid: string | null = null;
  private buffer = Buffer.alloc(0);

  constructor(private readonly socket: Socket) {
    super();
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('close', () => this.emit('close'));
    socket.on('error', (err) => this.emit('error', err));
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 3) {
      const type = this.buffer.readUInt8(0);
      const len = this.buffer.readUInt16BE(1);
      if (this.buffer.length < 3 + len) return;
      const payload = this.buffer.subarray(3, 3 + len);
      this.buffer = this.buffer.subarray(3 + len);

      switch (type) {
        case AS_TYPE_UUID:
          this.uuid = formatUuid(payload);
          this.emit('uuid', this.uuid);
          break;
        case AS_TYPE_AUDIO:
          this.emit('audio', Buffer.from(payload));
          break;
        case AS_TYPE_TERMINATE:
          this.emit('terminate');
          break;
        case AS_TYPE_ERROR:
          this.emit('error', new Error(`AudioSocket-Fehler ${payload.readUInt8(0)}`));
          break;
        default:
          // Unbekannte Rahmen werden ueberlesen, nicht als Fehler behandelt -
          // spaetere Asterisk-Versionen duerfen den Rahmen erweitern.
          break;
      }
    }
  }

  /** Sendet SLIN-Audio (PCM16, 8 kHz, little endian) an Asterisk. */
  sendAudio(pcm: Buffer): void {
    // Asterisk erwartet 20-ms-Bloecke; groessere Bloecke werden zerlegt.
    const blockBytes = 320;
    for (let off = 0; off < pcm.length; off += blockBytes) {
      const slice = pcm.subarray(off, Math.min(off + blockBytes, pcm.length));
      const header = Buffer.alloc(3);
      header.writeUInt8(AS_TYPE_AUDIO, 0);
      header.writeUInt16BE(slice.length, 1);
      this.socket.write(Buffer.concat([header, slice]));
    }
  }

  terminate(): void {
    const header = Buffer.alloc(3);
    header.writeUInt8(AS_TYPE_TERMINATE, 0);
    header.writeUInt16BE(0, 1);
    try {
      this.socket.write(header);
      this.socket.end();
    } catch {
      /* Verbindung schon zu */
    }
  }

  destroy(): void {
    this.socket.destroy();
  }
}

function formatUuid(b: Buffer): string {
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/* -------------------------------------------------------------------------- */
/* Anruf                                                                       */
/* -------------------------------------------------------------------------- */

class AsteriskCall implements CallHandle {
  readonly inboundSampleRate = TELEPHONY_SAMPLE_RATE;
  readonly outboundSampleRate = TELEPHONY_SAMPLE_RATE;

  private audioConn: AudioSocketConnection | null = null;
  private readonly audioQueue: Int16Array[] = [];
  private audioResolvers: ((v: IteratorResult<Int16Array>) => void)[] = [];
  private readonly dtmfBuffer: string[] = [];
  private dtmfResolver: ((v: string | null) => void) | null = null;
  private dtmfTimer: NodeJS.Timeout | null = null;
  private readonly dtmfHandlers: ((d: string) => void)[] = [];
  private readonly hangupHandlers: ((r: CallEndReason) => void)[] = [];
  private answerResult: AnswerResult | null = null;
  private answerWaiters: ((r: AnswerResult) => void)[] = [];
  private playbackAborted = false;
  private ended = false;

  constructor(
    readonly id: string,
    readonly direction: 'inbound' | 'outbound',
    readonly callerId: string | null,
    private readonly rest: AriRest,
    private readonly codec: 'alaw' | 'ulaw',
    private readonly logger: Logger,
  ) {}

  get active(): boolean {
    return !this.ended;
  }

  attachAudio(conn: AudioSocketConnection): void {
    this.audioConn = conn;
    conn.on('audio', (payload: Buffer) => {
      // Asterisk liefert bei AudioSocket SLIN (PCM16). Steht der Kanal auf
      // G.711, kommt stattdessen der Codec-Datenstrom - beides wird bedient.
      const pcm = payload.length % 2 === 0 ? bufferToPcm16(payload) : decodeG711(payload, this.codec);
      this.pushInbound(pcm);
    });
    conn.on('terminate', () => {
      void this.hangup('completed');
    });
    conn.on('error', (err: Error) => {
      this.logger.warn('audiosocket_fehler', { callId: this.id, error: err.message });
    });
  }

  private pushInbound(frame: Int16Array): void {
    const waiter = this.audioResolvers.shift();
    if (waiter !== undefined) {
      waiter({ value: frame, done: false });
      return;
    }
    // Begrenzt: bei einer Stoerung soll der Speicher nicht volllaufen.
    if (this.audioQueue.length > 500) this.audioQueue.shift();
    this.audioQueue.push(frame);
  }

  async *audioIn(): AsyncIterable<Int16Array> {
    while (!this.ended) {
      const queued = this.audioQueue.shift();
      if (queued !== undefined) {
        yield queued;
        continue;
      }
      const next = await new Promise<IteratorResult<Int16Array>>((resolve) => {
        this.audioResolvers.push(resolve);
      });
      if (next.done === true) return;
      yield next.value;
    }
  }

  settleAnswer(result: AnswerResult): void {
    if (this.answerResult !== null) return;
    this.answerResult = result;
    for (const w of this.answerWaiters) w(result);
    this.answerWaiters = [];
  }

  async answered(): Promise<AnswerResult> {
    if (this.answerResult !== null) return this.answerResult;
    return new Promise((resolve) => {
      this.answerWaiters.push(resolve);
    });
  }

  async playAudio(pcm: Int16Array): Promise<void> {
    if (this.ended || this.audioConn === null) return;
    this.playbackAborted = false;
    // In Bloecken senden und zwischendurch pruefen, ob abgebrochen wurde -
    // sonst laeuft die Ansage nach dem Barge-in noch weiter.
    const blockSamples = 160;
    for (let off = 0; off < pcm.length; off += blockSamples) {
      if (this.playbackAborted || this.ended) return;
      const slice = pcm.subarray(off, Math.min(off + blockSamples, pcm.length));
      this.audioConn.sendAudio(pcm16ToBuffer(slice));
      // Nicht schneller senden als Echtzeit, sonst laeuft der Puffer in
      // Asterisk voll und die Latenz steigt statt zu sinken.
      await sleep((slice.length / this.outboundSampleRate) * 1000);
    }
  }

  async stopAudio(): Promise<void> {
    this.playbackAborted = true;
  }

  onDtmfReceived(digit: string): void {
    for (const h of this.dtmfHandlers) h(digit);
    if (this.dtmfResolver === null) {
      this.dtmfBuffer.push(digit);
      return;
    }
    if (digit === '#') {
      this.resolveDtmf(this.dtmfBuffer.join(''));
      return;
    }
    this.dtmfBuffer.push(digit);
  }

  private resolveDtmf(value: string | null): void {
    const r = this.dtmfResolver;
    this.dtmfResolver = null;
    if (this.dtmfTimer !== null) {
      clearTimeout(this.dtmfTimer);
      this.dtmfTimer = null;
    }
    this.dtmfBuffer.length = 0;
    r?.(value);
  }

  async collectDtmf(maxDigits: number, timeoutMs: number): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.dtmfResolver = resolve;
      this.dtmfTimer = setTimeout(() => {
        const collected = this.dtmfBuffer.join('');
        this.resolveDtmf(collected.length > 0 ? collected.slice(0, maxDigits) : null);
      }, timeoutMs);

      // Bereits eingegangene Ziffern beruecksichtigen.
      const pending = this.dtmfBuffer.join('');
      if (pending.includes('#')) {
        this.resolveDtmf(pending.split('#')[0]?.slice(0, maxDigits) ?? '');
      } else if (pending.length >= maxDigits) {
        this.resolveDtmf(pending.slice(0, maxDigits));
      }
    });
  }

  onDtmf(handler: (digit: string) => void): void {
    this.dtmfHandlers.push(handler);
  }

  async hangup(reason: CallEndReason): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.playbackAborted = true;
    this.resolveDtmf(null);
    for (const r of this.audioResolvers) r({ value: undefined as never, done: true });
    this.audioResolvers = [];
    this.audioConn?.terminate();
    try {
      await this.rest.hangup(this.id);
    } catch {
      // Der Kanal kann bereits weg sein - das ist beim Auflegen der Normalfall.
    }
    for (const h of this.hangupHandlers) h(reason);
  }

  /** Wird gerufen, wenn Asterisk das Ende meldet (Gegenstelle hat aufgelegt). */
  markEnded(reason: CallEndReason): void {
    if (this.ended) return;
    this.ended = true;
    this.playbackAborted = true;
    this.resolveDtmf(null);
    for (const r of this.audioResolvers) r({ value: undefined as never, done: true });
    this.audioResolvers = [];
    this.audioConn?.destroy();
    for (const h of this.hangupHandlers) h(reason);
  }

  onHangup(handler: (reason: CallEndReason) => void): void {
    this.hangupHandlers.push(handler);
  }
}

/* -------------------------------------------------------------------------- */
/* REST-Client                                                                 */
/* -------------------------------------------------------------------------- */

class AriRest {
  constructor(
    private readonly baseUrl: string,
    private readonly user: string,
    private readonly password: string,
    private readonly appName: string,
  ) {}

  private get authHeader(): string {
    return `Basic ${Buffer.from(`${this.user}:${this.password}`).toString('base64')}`;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}/ari${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      throw new Error(`ARI ${method} ${path} fehlgeschlagen: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    return (text.length > 0 ? JSON.parse(text) : {}) as T;
  }

  async originate(endpoint: string, callerId: string): Promise<{ id: string }> {
    return this.call<{ id: string }>('POST', '/channels', {
      endpoint,
      app: this.appName,
      callerId,
      timeout: 45,
    });
  }

  async answer(channelId: string): Promise<void> {
    await this.call('POST', `/channels/${encodeURIComponent(channelId)}/answer`);
  }

  async hangup(channelId: string): Promise<void> {
    await this.call('DELETE', `/channels/${encodeURIComponent(channelId)}`);
  }

  async createBridge(): Promise<{ id: string }> {
    return this.call<{ id: string }>('POST', '/bridges', { type: 'mixing' });
  }

  async addToBridge(bridgeId: string, channelIds: string[]): Promise<void> {
    await this.call(
      'POST',
      `/bridges/${encodeURIComponent(bridgeId)}/addChannel?channel=${channelIds.map(encodeURIComponent).join(',')}`,
    );
  }

  async destroyBridge(bridgeId: string): Promise<void> {
    await this.call('DELETE', `/bridges/${encodeURIComponent(bridgeId)}`);
  }

  /** Erzeugt den externalMedia-Kanal, der das Audio zu uns leitet. */
  async externalMedia(host: string, uuid: string): Promise<{ id: string }> {
    return this.call<{ id: string }>('POST', '/channels/externalMedia', {
      app: this.appName,
      external_host: host,
      format: 'slin',
      encapsulation: 'audiosocket',
      transport: 'tcp',
      connection_type: 'client',
      data: uuid,
    });
  }

  async listChannels(): Promise<unknown[]> {
    return this.call<unknown[]>('GET', '/channels');
  }

  async asteriskInfo(): Promise<{ system?: { version?: string } }> {
    return this.call('GET', '/asterisk/info');
  }
}

/* -------------------------------------------------------------------------- */
/* Port                                                                        */
/* -------------------------------------------------------------------------- */

export class AsteriskTelephony implements TelephonyPort {
  readonly name = 'asterisk-ari';

  private ws: WebSocket | null = null;
  private audioServer: NetServer | null = null;
  private readonly rest: AriRest;
  private readonly callsByChannel = new Map<string, AsteriskCall>();
  private readonly pendingAudioByUuid = new Map<string, AsteriskCall>();
  private readonly bridgeByCall = new Map<string, string>();
  private incomingHandler: ((c: CallHandle) => void | Promise<void>) | null = null;
  private reconnectAttempt = 0;
  private stopping = false;

  constructor(private readonly cfg: AsteriskConfig) {
    this.rest = new AriRest(cfg.ariUrl, cfg.ariUser, cfg.ariPassword, cfg.appName);
  }

  async start(): Promise<void> {
    this.stopping = false;
    await this.startAudioServer();
    await this.connectEvents();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const call of this.callsByChannel.values()) {
      await call.hangup('hangup_by_system');
    }
    this.ws?.close();
    this.ws = null;
    await new Promise<void>((resolve) => {
      if (this.audioServer === null) {
        resolve();
        return;
      }
      this.audioServer.close(() => resolve());
    });
    this.audioServer = null;
  }

  private async startAudioServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => {
        socket.setNoDelay(true);
        const conn = new AudioSocketConnection(socket);
        conn.once('uuid', (uuid: string) => {
          const call = this.pendingAudioByUuid.get(uuid);
          if (call === undefined) {
            this.cfg.logger.warn('audiosocket_ohne_anruf', { uuid });
            conn.destroy();
            return;
          }
          this.pendingAudioByUuid.delete(uuid);
          call.attachAudio(conn);
          this.cfg.logger.info('audiosocket_verbunden', { callId: call.id });
        });
      });
      server.on('error', reject);
      server.listen(this.cfg.audioSocketBind.port, this.cfg.audioSocketBind.host, () => {
        this.audioServer = server;
        this.cfg.logger.info('audiosocket_lauscht', {
          host: this.cfg.audioSocketBind.host,
          port: this.cfg.audioSocketBind.port,
        });
        resolve();
      });
    });
  }

  private async connectEvents(): Promise<void> {
    const url = new URL(`${this.cfg.ariUrl.replace(/^http/, 'ws')}/ari/events`);
    url.searchParams.set('app', this.cfg.appName);
    url.searchParams.set('subscribeAll', 'true');
    url.searchParams.set('api_key', `${this.cfg.ariUser}:${this.cfg.ariPassword}`);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url.toString());
      let settled = false;

      ws.on('open', () => {
        this.reconnectAttempt = 0;
        this.cfg.logger.info('ari_verbunden', { app: this.cfg.appName });
        settled = true;
        resolve();
      });
      ws.on('message', (raw) => {
        try {
          // ws liefert je nach Verbindung string, Buffer oder ein Array
          // von Buffern. Alles andere waere ein Fehler des Gegenuebers und
          // wird als solcher behandelt.
          const text =
            typeof raw === 'string'
              ? raw
              : Buffer.isBuffer(raw)
                ? raw.toString('utf8')
                : Array.isArray(raw)
                  ? Buffer.concat(raw).toString('utf8')
                  : Buffer.from(raw).toString('utf8');
          this.handleEvent(JSON.parse(text) as AriEvent);
        } catch (err) {
          this.cfg.logger.warn('ari_ereignis_unlesbar', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
      ws.on('error', (err) => {
        this.cfg.logger.error('ari_fehler', { error: err.message });
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      ws.on('close', () => {
        this.ws = null;
        if (!this.stopping) void this.scheduleReconnect();
      });
      this.ws = ws;
    });
  }

  /** Wiederverbindung mit exponentiellem Backoff - ein Netzhaenger darf Jarvis nicht abmelden. */
  private async scheduleReconnect(): Promise<void> {
    this.reconnectAttempt += 1;
    const waitMs = Math.min(30_000, 1000 * 2 ** Math.min(this.reconnectAttempt, 5));
    this.cfg.logger.warn('ari_wiederverbindung', { attempt: this.reconnectAttempt, waitMs });
    await sleep(waitMs);
    if (this.stopping) return;
    try {
      await this.connectEvents();
    } catch {
      void this.scheduleReconnect();
    }
  }

  private handleEvent(evt: AriEvent): void {
    const channelId = evt.channel?.id;
    switch (evt.type) {
      case 'StasisStart': {
        if (channelId === undefined) return;
        // Der externalMedia-Kanal landet ebenfalls in Stasis - der wird
        // nicht als Anruf behandelt.
        if (evt.args?.includes('external_media') === true) return;
        void this.onStasisStart(channelId, evt.channel?.caller?.number ?? null);
        break;
      }
      case 'ChannelDtmfReceived': {
        if (channelId === undefined || evt.digit === undefined) return;
        this.callsByChannel.get(channelId)?.onDtmfReceived(evt.digit);
        break;
      }
      case 'ChannelStateChange': {
        if (channelId === undefined) return;
        if (evt.channel?.state === 'Up') {
          this.callsByChannel.get(channelId)?.settleAnswer({ answered: true });
        }
        break;
      }
      case 'StasisEnd':
      case 'ChannelDestroyed': {
        if (channelId === undefined) return;
        const call = this.callsByChannel.get(channelId);
        if (call === undefined) return;
        this.callsByChannel.delete(channelId);
        call.settleAnswer({ answered: false, reason: 'no_answer' });
        call.markEnded('completed');
        void this.teardownBridge(channelId);
        break;
      }
      default:
        break;
    }
  }

  private async onStasisStart(channelId: string, callerId: string | null): Promise<void> {
    const existing = this.callsByChannel.get(channelId);
    if (existing !== undefined) {
      existing.settleAnswer({ answered: true });
      return;
    }
    const call = new AsteriskCall(
      channelId,
      'inbound',
      callerId,
      this.rest,
      this.cfg.codec,
      this.cfg.logger,
    );
    this.callsByChannel.set(channelId, call);

    try {
      await this.rest.answer(channelId);
      await this.setupMedia(call);
      call.settleAnswer({ answered: true });
      await this.incomingHandler?.(call);
    } catch (err) {
      this.cfg.logger.error('eingehender_anruf_fehlgeschlagen', {
        callId: channelId,
        error: err instanceof Error ? err.message : String(err),
      });
      await call.hangup('network_error');
    }
  }

  /** Bridge aus Anrufkanal und externalMedia-Kanal aufbauen. */
  private async setupMedia(call: AsteriskCall): Promise<void> {
    const uuid = globalThis.crypto.randomUUID();
    this.pendingAudioByUuid.set(uuid, call);

    const host = `${this.cfg.audioSocketBind.host}:${this.cfg.audioSocketBind.port}`;
    const media = await this.rest.externalMedia(host, uuid);
    const bridge = await this.rest.createBridge();
    this.bridgeByCall.set(call.id, bridge.id);
    await this.rest.addToBridge(bridge.id, [call.id, media.id]);
  }

  private async teardownBridge(callId: string): Promise<void> {
    const bridgeId = this.bridgeByCall.get(callId);
    if (bridgeId === undefined) return;
    this.bridgeByCall.delete(callId);
    try {
      await this.rest.destroyBridge(bridgeId);
    } catch {
      /* Bridge kann bereits abgeraeumt sein */
    }
  }

  async dialOwner(reason: string): Promise<CallHandle> {
    // Die Zielnummer kommt ausschliesslich aus der Konfiguration.
    const target = this.cfg.ownerPhone;
    const endpoint = `${this.cfg.trunkEndpoint}/${target}`;
    this.cfg.logger.info('waehle_eigentuemer', { reason });

    const channel = await this.rest.originate(endpoint, this.cfg.jarvisPhone);
    const call = new AsteriskCall(
      channel.id,
      'outbound',
      target,
      this.rest,
      this.cfg.codec,
      this.cfg.logger,
    );
    this.callsByChannel.set(channel.id, call);
    await this.setupMedia(call);
    return call;
  }

  onIncomingCall(handler: (call: CallHandle) => void | Promise<void>): void {
    this.incomingHandler = handler;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const info = await this.rest.asteriskInfo();
      const wsOk = this.ws !== null && this.ws.readyState === WebSocket.OPEN;
      return {
        ok: wsOk,
        message: wsOk
          ? `Asterisk ${info.system?.version ?? 'unbekannt'}, ARI-Ereignisstrom verbunden`
          : `Asterisk ${info.system?.version ?? 'unbekannt'} erreichbar, aber der ARI-Ereignisstrom ist getrennt`,
      };
    } catch (err) {
      return {
        ok: false,
        message: `Asterisk nicht erreichbar unter ${this.cfg.ariUrl}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export { encodeG711 };
export type { E164 };
