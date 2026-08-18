export interface Transkript {
  text: string;
  sprache?: string;
}

export interface SprachAusgabe {
  audio: Buffer;
  mimeType: string;
}

export interface SttProvider {
  readonly id: string;
  readonly label: string;
  /** true, wenn die Umsetzung im Fenster (Web Speech API) passiert. */
  readonly imFenster: boolean;
  configured(): boolean;
  missingHint(): string;
  transcribe(audio: Buffer, mimeType: string): Promise<Transkript>;
}

export interface TtsProvider {
  readonly id: string;
  readonly label: string;
  readonly imFenster: boolean;
  configured(): boolean;
  missingHint(): string;
  synthesize(text: string, stimme?: string): Promise<SprachAusgabe>;
}

export class VoiceError extends Error {
  constructor(
    message: string,
    readonly provider: string
  ) {
    super(message);
    this.name = 'VoiceError';
  }
}
