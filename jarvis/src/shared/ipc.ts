import type {
  AgentEvent,
  Approval,
  AuditEntry,
  Campaign,
  ChatMessage,
  Company,
  EmailRecord,
  MemoryItem,
  OutreachRow,
  SuppressionEntry,
  SystemStatus
} from './types';

/**
 * Der vollständige Vertrag zwischen Fenster und Kern.
 *
 * Der Renderer hat keinen Node-Zugriff. Alles, was er kann, steht hier –
 * und nur diese Kanäle werden im Preload freigeschaltet.
 */
export const KANAL = {
  senden: 'jarvis:senden',
  verlauf: 'jarvis:verlauf',
  status: 'jarvis:status',
  vorlesetext: 'jarvis:vorlesetext',

  freigabenOffen: 'freigaben:offen',
  freigabeEntscheiden: 'freigaben:entscheiden',
  freigabenVerlauf: 'freigaben:verlauf',

  versandzentrale: 'versandzentrale:zeilen',
  kampagnen: 'kampagnen:liste',
  unternehmen: 'unternehmen:liste',

  entwuerfe: 'entwuerfe:liste',
  entwurfLesen: 'entwuerfe:lesen',
  entwurfAendern: 'entwuerfe:aendern',
  freigabeAnfordern: 'entwuerfe:freigabe-anfordern',

  protokoll: 'protokoll:lesen',
  gedaechtnis: 'gedaechtnis:liste',
  gedaechtnisLoeschen: 'gedaechtnis:loeschen',
  verlaufLoeschen: 'gedaechtnis:verlauf-loeschen',

  sperrliste: 'sperrliste:liste',
  sperrlisteHinzu: 'sperrliste:hinzufuegen',
  sperrlisteEntfernen: 'sperrliste:entfernen',

  zugangsdaten: 'zugangsdaten:status',
  zugangsdatenSetzen: 'zugangsdaten:setzen',
  zugangsdatenEntfernen: 'zugangsdaten:entfernen',
  googleVerbinden: 'zugangsdaten:google-verbinden',

  transkribieren: 'sprache:transkribieren',
  sprechen: 'sprache:sprechen',

  ereignis: 'jarvis:ereignis'
} as const;

export interface SecretStateDto {
  name: string;
  label: string;
  hint: string;
  group: string;
  source: 'umgebung' | 'tresor' | 'fehlt';
}

export interface FreigabeAnsicht {
  approval: Approval;
  email: EmailRecord | null;
}

export interface AntwortDto {
  nachricht: ChatMessage;
  agent: string;
  wartetAufFreigabe: boolean;
}

export interface SprachAusgabeDto {
  imFenster: boolean;
  audioBase64?: string;
  mimeType?: string;
  fehler?: string;
}

export interface JarvisApi {
  senden(text: string): Promise<AntwortDto>;
  verlauf(): Promise<ChatMessage[]>;
  status(): Promise<SystemStatus>;
  vorlesetext(emailId: number): Promise<{ ok: boolean; text: string }>;

  offeneFreigaben(): Promise<FreigabeAnsicht[]>;
  entscheiden(approvalId: number, freigegeben: boolean, notiz?: string): Promise<{ ok: boolean; meldung: string }>;
  freigabenVerlauf(limit?: number): Promise<Approval[]>;

  versandzentrale(filter?: { campaignId?: number; status?: string }): Promise<OutreachRow[]>;
  kampagnen(): Promise<Campaign[]>;
  unternehmen(suche?: string): Promise<Company[]>;

  entwuerfe(status?: string): Promise<EmailRecord[]>;
  entwurfLesen(emailId: number): Promise<EmailRecord | null>;
  entwurfAendern(
    emailId: number,
    patch: { subject?: string; bodyText?: string; to?: string[] }
  ): Promise<EmailRecord | null>;
  freigabeAnfordern(emailId: number): Promise<{ ok: boolean; meldung: string; approvalId?: number }>;

  protokoll(limit?: number): Promise<AuditEntry[]>;
  gedaechtnis(): Promise<MemoryItem[]>;
  gedaechtnisLoeschen(id: number): Promise<boolean>;
  verlaufLoeschen(): Promise<number>;

  sperrliste(): Promise<SuppressionEntry[]>;
  sperrlisteHinzu(wert: string, art: 'adresse' | 'domain', grund?: string): Promise<SuppressionEntry>;
  sperrlisteEntfernen(id: number): Promise<boolean>;

  zugangsdaten(): Promise<{ eintraege: SecretStateDto[]; tresor: string }>;
  zugangsdatenSetzen(name: string, wert: string): Promise<{ ok: boolean; meldung: string }>;
  zugangsdatenEntfernen(name: string): Promise<{ ok: boolean }>;
  googleVerbinden(): Promise<{ ok: boolean; meldung: string }>;

  transkribieren(audio: ArrayBuffer, mimeType: string): Promise<{ text: string; imFenster: boolean; fehler?: string }>;
  sprechen(text: string): Promise<SprachAusgabeDto>;

  /** Ereignisstrom des Kerns (Zustand, Werkzeuge, Fortschritt). */
  aufEreignis(listener: (event: AgentEvent) => void): () => void;
}

declare global {
  interface Window {
    jarvis: JarvisApi;
  }
}
