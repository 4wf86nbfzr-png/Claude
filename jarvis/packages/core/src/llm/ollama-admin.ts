import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { err, fromException, ok, type Result } from '../util/result.js';
import { OllamaProvider } from './ollama.js';

/**
 * Verwaltung des lokalen Modells.
 *
 * Warum das ein eigenes Modul ist: der Provider soll nur reden koennen.
 * Installieren, Modelle laden und pruefen, ob ein Modell ueberhaupt
 * Werkzeuge aufrufen kann, ist Einrichtung -- und die laeuft einmal.
 *
 * Der wichtigste Teil ist `pruefeWerkzeugtauglichkeit`. Viele lokale Modelle
 * behaupten Werkzeugunterstuetzung, rufen aber nie eines auf, sondern
 * schreiben stattdessen "Ich rufe jetzt search_web auf" als Fliesstext.
 * Ein solches Modell ist fuer JARVIS unbrauchbar, weil dann nichts passiert.
 * Deshalb wird das vor der Empfehlung tatsaechlich ausprobiert.
 */

/** Modelle, die Werkzeugaufrufe beherrschen, nach Bedarf sortiert. */
export interface ModellEmpfehlung {
  name: string;
  /** Ungefaehrer Download. */
  groesse: string;
  /** Empfohlener freier Arbeitsspeicher. */
  ram: string;
  eignung: string;
}

export const EMPFOHLENE_MODELLE: ModellEmpfehlung[] = [
  {
    name: 'qwen3:8b',
    groesse: '5 GB',
    ram: '16 GB',
    eignung: 'Guter Ausgangspunkt: beherrscht Werkzeuge zuverlässig und antwortet ordentlich auf Deutsch.',
  },
  {
    name: 'qwen2.5:14b',
    groesse: '9 GB',
    ram: '32 GB',
    eignung: 'Deutlich sorgfältiger bei mehrstufigen Aufträgen. Empfehlung, wenn der Rechner es trägt.',
  },
  {
    name: 'llama3.1:8b',
    groesse: '5 GB',
    ram: '16 GB',
    eignung: 'Solide Alternative, etwas schwächer im Deutschen.',
  },
  {
    name: 'qwen2.5:7b',
    groesse: '5 GB',
    ram: '16 GB',
    eignung: 'Sparsam. Für einfache Aufträge ausreichend, bei langen Ketten ungenau.',
  },
  {
    name: 'mistral-nemo:12b',
    groesse: '7 GB',
    ram: '24 GB',
    eignung: 'Gut im Deutschen, mittlerer Bedarf.',
  },
];

export interface InstalliertesModell {
  name: string;
  groesseBytes: number;
  geaendertAm: string;
}

export interface WerkzeugPruefung {
  modell: string;
  /** Hat das Modell tatsaechlich ein Werkzeug aufgerufen? */
  ruftWerkzeugeAuf: boolean;
  /** Hat es die Argumente richtig gefuellt? */
  argumenteKorrekt: boolean;
  dauerMs: number;
  /** Was es stattdessen geantwortet hat, falls es kein Werkzeug rief. */
  stattdessen?: string;
  urteil: string;
}

export class OllamaAdmin {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get url(): string {
    return this.baseUrl.replace(/\/$/, '');
  }

  /** Laeuft der Dienst? */
  async erreichbar(timeoutMs = 2500): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.url}/api/tags`, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Ist das Programm ueberhaupt installiert? */
  static async installiert(): Promise<boolean> {
    return new Promise((resolve) => {
      const befehl = platform() === 'win32' ? 'where' : 'which';
      try {
        const kind = spawn(befehl, ['ollama'], { stdio: 'ignore', shell: false });
        kind.on('error', () => resolve(false));
        kind.on('close', (code) => resolve(code === 0));
      } catch {
        resolve(false);
      }
    });
  }

  /** Klartext-Anleitung fuer das jeweilige System. */
  static installationsHinweis(): string {
    switch (platform()) {
      case 'darwin':
        return 'Ollama installieren: brew install ollama    (oder von ollama.com laden)\nDanach starten mit: ollama serve';
      case 'win32':
        return 'Ollama von ollama.com herunterladen und installieren.\nDer Dienst startet danach automatisch mit Windows.';
      default:
        return 'Ollama installieren: curl -fsSL https://ollama.com/install.sh | sh\nDanach starten mit: ollama serve';
    }
  }

  async modelle(): Promise<Result<InstalliertesModell[]>> {
    try {
      const res = await this.fetchImpl(`${this.url}/api/tags`);
      if (!res.ok) {
        return err('PROVIDER_ERROR', `Ollama antwortete mit HTTP ${res.status}.`);
      }
      const json = (await res.json()) as {
        models?: Array<{ name?: string; model?: string; size?: number; modified_at?: string }>;
      };
      return ok(
        (json.models ?? []).map((m) => ({
          name: m.name ?? m.model ?? '(unbenannt)',
          groesseBytes: m.size ?? 0,
          geaendertAm: m.modified_at ?? '',
        })),
      );
    } catch (e) {
      return fromException(e, 'NETWORK_ERROR');
    }
  }

  /**
   * Laedt ein Modell herunter. Ollama streamt dabei den Fortschritt als
   * NDJSON -- jede Zeile ein Objekt. Wir reichen den Stand nach oben durch,
   * damit ein mehrere Gigabyte grosser Download nicht wie ein Absturz wirkt.
   */
  async ziehe(
    modell: string,
    onFortschritt?: (stand: { status: string; anteil: number | null }) => void,
  ): Promise<Result<{ modell: string }>> {
    try {
      const res = await this.fetchImpl(`${this.url}/api/pull`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: modell, stream: true }),
      });
      if (!res.ok || !res.body) {
        return err('PROVIDER_ERROR', `Ollama lehnte den Download ab (HTTP ${res.status}).`, {
          hint: `Gibt es das Modell "${modell}"? Namen prüfen auf ollama.com/library`,
        });
      }

      const leser = res.body.getReader();
      const dekoder = new TextDecoder();
      let rest = '';
      let letzterFehler: string | null = null;

      for (;;) {
        const { done, value } = await leser.read();
        if (done) break;
        rest += dekoder.decode(value, { stream: true });

        const zeilen = rest.split('\n');
        rest = zeilen.pop() ?? '';
        for (const zeile of zeilen) {
          if (!zeile.trim()) continue;
          try {
            const stand = JSON.parse(zeile) as {
              status?: string;
              error?: string;
              completed?: number;
              total?: number;
            };
            if (stand.error) letzterFehler = stand.error;
            onFortschritt?.({
              status: stand.status ?? '',
              anteil:
                stand.total && stand.total > 0 && stand.completed !== undefined
                  ? stand.completed / stand.total
                  : null,
            });
          } catch {
            // Unvollstaendige Zeile -- beim naechsten Durchlauf wieder da.
          }
        }
      }

      if (letzterFehler) {
        return err('PROVIDER_ERROR', `Download fehlgeschlagen: ${letzterFehler}`);
      }
      return ok({ modell });
    } catch (e) {
      return fromException(e, 'NETWORK_ERROR');
    }
  }

  /**
   * Der entscheidende Test: ruft das Modell wirklich ein Werkzeug auf?
   *
   * Wir stellen eine Frage, die sich ohne das Werkzeug nicht beantworten
   * laesst, und schauen nach, ob ein Werkzeugaufruf zurueckkommt -- und ob
   * die Argumente stimmen. Ein Modell, das hier durchfaellt, kann in JARVIS
   * nichts ausrichten, egal wie gut es formuliert.
   */
  async pruefeWerkzeugtauglichkeit(modell: string, timeoutMs = 120_000): Promise<Result<WerkzeugPruefung>> {
    const provider = new OllamaProvider({
      baseUrl: this.baseUrl,
      model: modell,
      fetchImpl: this.fetchImpl as never,
      timeoutMs,
    });

    const start = Date.now();
    try {
      const antwort = await provider.chat({
        system:
          'Du bist ein Assistent mit Werkzeugen. Wenn ein Werkzeug zur Frage passt, rufe es auf. ' +
          'Antworte nicht mit Text, wenn ein Werkzeug passt.',
        messages: [{ role: 'user', content: 'Wie ist das Wetter gerade in Hamburg?' }],
        tools: [
          {
            name: 'hole_wetter',
            description: 'Liefert das aktuelle Wetter für einen Ort.',
            parameters: {
              type: 'object',
              properties: {
                ort: { type: 'string', description: 'Name der Stadt, z. B. "Hamburg"' },
              },
              required: ['ort'],
            },
          },
        ],
        toolChoice: 'auto',
        temperature: 0,
        maxTokens: 300,
      });

      const dauerMs = Date.now() - start;
      const aufruf = antwort.toolCalls[0];
      const ruftAuf = antwort.toolCalls.length > 0 && aufruf?.name === 'hole_wetter';
      const ort = aufruf?.arguments?.ort;
      const argumenteKorrekt = typeof ort === 'string' && ort.toLowerCase().includes('hamburg');

      return ok({
        modell,
        ruftWerkzeugeAuf: ruftAuf,
        argumenteKorrekt,
        dauerMs,
        ...(ruftAuf ? {} : { stattdessen: antwort.text.slice(0, 300) }),
        urteil: !ruftAuf
          ? 'Ungeeignet: Das Modell ruft keine Werkzeuge auf, sondern antwortet nur mit Text. In JARVIS würde damit nichts passieren.'
          : !argumenteKorrekt
            ? 'Eingeschränkt geeignet: Das Werkzeug wird aufgerufen, die Argumente stimmen aber nicht. Rechnen Sie mit Fehlgriffen.'
            : dauerMs > 30_000
              ? `Geeignet, aber langsam (${Math.round(dauerMs / 1000)} s für einen Schritt). Ein Auftrag mit zehn Schritten dauert entsprechend.`
              : `Geeignet. Ein Denkschritt dauerte ${(dauerMs / 1000).toFixed(1)} s.`,
      });
    } catch (e) {
      return fromException(e, 'PROVIDER_ERROR');
    }
  }
}
