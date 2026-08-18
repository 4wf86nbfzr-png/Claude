import type { LlmProvider, LlmRequest, LlmResponse } from '../../src/core/services/llm';
import type { MailTransport, OutgoingMessage, SendResult } from '../../src/core/services/mail';

/**
 * Sprachmodell-Ersatz für Tests: liefert je nach Systemanweisung eine feste,
 * gültige Antwort. So lässt sich der ganze Ablauf prüfen, ohne einen echten
 * Dienst zu rufen.
 */
export class FakeLlm implements LlmProvider {
  readonly id = 'test';
  readonly label = 'Testmodell';
  readonly anfragen: LlmRequest[] = [];

  constructor(private readonly antworten: Partial<LlmResponse>[] = []) {}

  configured(): boolean {
    return true;
  }
  missingHint(): string {
    return '';
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.anfragen.push(request);
    if (request.system.includes('Erstkontakt-E-Mails')) {
      const firma = /Empfängerunternehmen: (.+)/.exec(request.messages[0]?.content ?? '')?.[1] ?? 'Ihr Unternehmen';
      return {
        text: JSON.stringify({
          subject: `Baustellenbewachung für ${firma}`,
          bodyText: `Moin,\n\nIhr Unternehmen ${firma} ist im Hamburger Hochbau tätig.\n\nWir stellen Sicherheitspersonal für Baustellen.\n\nHätten Sie kommende Woche zehn Minuten für ein kurzes Gespräch?`,
          akquisegrund: `${firma} betreibt laut Website Baustellen im Hamburger Raum.`
        }),
        toolCalls: [],
        stopReason: 'end_turn'
      };
    }
    const naechste = this.antworten.shift();
    return {
      text: naechste?.text ?? 'In Ordnung.',
      toolCalls: naechste?.toolCalls ?? [],
      stopReason: naechste?.stopReason ?? 'end_turn'
    };
  }
}

/** Versandweg-Ersatz: merkt sich, was gesendet worden wäre. */
export class FakeTransport implements MailTransport {
  readonly id = 'test';
  readonly label = 'Testversand';
  readonly gesendet: OutgoingMessage[] = [];
  fehlerBeimNaechsten: string | null = null;

  configured(): boolean {
    return true;
  }
  missingHint(): string {
    return '';
  }
  async verify(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
  async send(message: OutgoingMessage): Promise<SendResult> {
    if (this.fehlerBeimNaechsten) {
      const fehler = this.fehlerBeimNaechsten;
      this.fehlerBeimNaechsten = null;
      return { ok: false, error: fehler };
    }
    this.gesendet.push(message);
    return { ok: true, messageId: `<test-${this.gesendet.length}@example.invalid>` };
  }
}

const STARTSEITE = `<!doctype html>
<html lang="de"><head>
  <title>Beispiel Bau GmbH | Hochbau in Hamburg</title>
  <meta name="description" content="Beispiel Bau GmbH realisiert Hochbau und Projektentwicklung in Hamburg.">
</head><body>
  <h1>Beispiel Bau GmbH</h1>
  <p>Wir bauen seit 1998 in Hamburg. Zurzeit laufen mehrere Baustellen in der HafenCity.</p>
  <nav><a href="/kontakt">Kontakt</a> <a href="/impressum">Impressum</a></nav>
</body></html>`;

const IMPRESSUM = `<!doctype html>
<html lang="de"><head><title>Impressum – Beispiel Bau GmbH</title></head><body>
  <h1>Impressum</h1>
  <p>Beispiel Bau GmbH<br>Hafenstraße 12<br>20095 Hamburg</p>
  <p>Geschäftsführer: Klaus Meier</p>
  <p>Telefon: 040 1234560<br>
  E-Mail: <a href="mailto:info@beispiel-bau.de">info@beispiel-bau.de</a></p>
  <p>Webseite erstellt von <a href="mailto:hallo@agentur-nord.de">hallo@agentur-nord.de</a></p>
</body></html>`;

const KONTAKT = `<!doctype html>
<html lang="de"><head><title>Kontakt – Beispiel Bau GmbH</title></head><body>
  <h1>Kontakt</h1>
  <p>Bauleiter: Sabine Wolters</p>
  <p>Schreiben Sie uns: <a href="mailto:info@beispiel-bau.de">info@beispiel-bau.de</a></p>
</body></html>`;

/** Ersetzt das Netz: Suchdienst und eine vollständige Beispiel-Firmenwebsite. */
export function fakeFetch(zaehler?: { anfragen: string[] }): typeof fetch {
  return (async (eingabe: RequestInfo | URL): Promise<Response> => {
    const url = typeof eingabe === 'string' ? eingabe : eingabe instanceof URL ? eingabe.toString() : eingabe.url;
    zaehler?.anfragen.push(url);

    if (url.startsWith('https://api.search.brave.com')) {
      return json({
        web: {
          results: [
            {
              title: 'Beispiel Bau GmbH – Hochbau Hamburg',
              url: 'https://www.beispiel-bau.de/',
              description: 'Hochbau und Projektentwicklung in Hamburg.'
            },
            {
              title: 'Bauunternehmen Hamburg – Gelbe Seiten',
              url: 'https://www.gelbeseiten.de/branchen/bauunternehmen/hamburg',
              description: 'Verzeichnis'
            }
          ]
        }
      });
    }
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /intern/\n', { status: 200 });
    if (/beispiel-bau\.de\/?$/.test(url)) return html(STARTSEITE);
    if (url.includes('beispiel-bau.de/impressum')) return html(IMPRESSUM);
    if (url.includes('beispiel-bau.de/kontakt')) return html(KONTAKT);
    return new Response('nicht gefunden', { status: 404 });
  }) as typeof fetch;
}

const html = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

const json = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

/** Umgebung für den Kern im Test – keine echten Dienste, keine echten Pfade. */
export function testEnv(dataDir: string): NodeJS.ProcessEnv {
  return {
    JARVIS_DATA_DIR: dataDir,
    JARVIS_DB_PATH: ':memory:',
    JARVIS_SEARCH_PROVIDER: 'brave',
    BRAVE_API_KEY: 'test-schluessel',
    JARVIS_MAIL_PROVIDER: 'smtp',
    MAIL_FROM_ADDRESS: 'dispo@hermserviceteam.com',
    MAIL_FROM_NAME: 'HERM Service Team',
    JARVIS_SENDER_PERSON: 'Maik Herm',
    JARVIS_SENDER_ROLE: 'Inhaber',
    JARVIS_SENDER_PHONE: '040 000000',
    JARVIS_MIN_REQUEST_DELAY_MS: '0',
    JARVIS_SEND_COOLDOWN_SECONDS: '0',
    JARVIS_HTTP_TIMEOUT_MS: '3000',
    JARVIS_DAILY_SEND_LIMIT: '5'
  };
}
