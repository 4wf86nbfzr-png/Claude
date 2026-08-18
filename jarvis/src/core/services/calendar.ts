import type { CredentialService } from './credentials';
import { GoogleOAuthClient } from './mail/googleOAuth';

export interface Termin {
  titel: string;
  beginn: string;
  ende: string;
  ort: string | null;
  beschreibung: string | null;
  ganztaegig: boolean;
}

export interface CalendarService {
  readonly id: string;
  configured(): boolean;
  missingHint(): string;
  termine(von: Date, bis: Date, maxAnzahl?: number): Promise<Termin[]>;
}

/** Kein Kalender verbunden – meldet das, statt Termine zu erfinden. */
export class KeinKalender implements CalendarService {
  readonly id = 'keiner';
  configured(): boolean {
    return false;
  }
  missingHint(): string {
    return 'Kein Kalender verbunden. Google-Kalender in den Einstellungen verbinden (GOOGLE_CLIENT_ID/SECRET nötig).';
  }
  async termine(): Promise<Termin[]> {
    throw new Error(this.missingHint());
  }
}

/**
 * Lesezugriff auf den Google-Kalender.
 * Bewusst nur lesend – Termine anlegen wäre eine Aktion nach außen und
 * müsste über die Freigabestelle laufen.
 */
export class GoogleCalendarService implements CalendarService {
  readonly id = 'google';
  private accessToken: string | null = null;
  private ablauf = 0;

  constructor(
    private readonly credentials: CredentialService,
    private readonly oauth = new GoogleOAuthClient(
      credentials.get('GOOGLE_CLIENT_ID'),
      credentials.get('GOOGLE_CLIENT_SECRET')
    )
  ) {}

  configured(): boolean {
    return this.oauth.configured() && Boolean(this.credentials.get('GOOGLE_REFRESH_TOKEN'));
  }

  missingHint(): string {
    if (!this.oauth.configured()) return this.oauth.missingHint();
    return 'Noch nicht mit Google verbunden – in den Einstellungen "Mit Google verbinden" ausführen.';
  }

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.ablauf - 60_000) return this.accessToken;
    const refresh = this.credentials.get('GOOGLE_REFRESH_TOKEN');
    if (!refresh) throw new Error(this.missingHint());
    const tokens = await this.oauth.erneuern(refresh);
    this.accessToken = tokens.accessToken;
    this.ablauf = tokens.expiresAt;
    return tokens.accessToken;
  }

  async termine(von: Date, bis: Date, maxAnzahl = 20): Promise<Termin[]> {
    const token = await this.token();
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', von.toISOString());
    url.searchParams.set('timeMax', bis.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', String(maxAnzahl));
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`Google Kalender antwortete mit HTTP ${response.status}.`);
    }
    const data = (await response.json()) as {
      items?: {
        summary?: string;
        location?: string;
        description?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }[];
    };
    return (data.items ?? []).map((eintrag) => ({
      titel: eintrag.summary ?? '(ohne Titel)',
      beginn: eintrag.start?.dateTime ?? eintrag.start?.date ?? '',
      ende: eintrag.end?.dateTime ?? eintrag.end?.date ?? '',
      ort: eintrag.location ?? null,
      beschreibung: eintrag.description ?? null,
      ganztaegig: Boolean(eintrag.start?.date)
    }));
  }
}

export function createCalendarService(credentials: CredentialService): CalendarService {
  const google = new GoogleCalendarService(credentials);
  return google.configured() ? google : new KeinKalender();
}
