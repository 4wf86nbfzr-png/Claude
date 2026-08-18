import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { OllamaAdmin, EMPFOHLENE_MODELLE } from '../src/llm/ollama-admin.js';
import { OllamaProvider } from '../src/llm/ollama.js';

/**
 * Gegen einen echten kleinen HTTP-Server statt gegen eine Attrappe:
 * so laeuft der gesamte Weg durch -- Anfrage bauen, NDJSON-Strom lesen,
 * Werkzeugaufrufe aus der Antwort holen.
 *
 * Wichtig ist vor allem der letzte Block: ein Modell, das nur Text schreibt
 * statt Werkzeuge aufzurufen, muss als ungeeignet erkannt werden. Sonst
 * richtet JARVIS damit nichts aus und der Benutzer sucht den Fehler bei sich.
 */

let server: Server | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
  }
});

interface StubOptionen {
  modelle?: Array<{ name: string; size: number; modified_at: string }>;
  /** Was /api/chat antwortet. */
  chat?: (koerper: Record<string, unknown>) => unknown;
  /** Zeilen, die /api/pull als NDJSON schickt. */
  pullZeilen?: unknown[];
}

async function starteStub(optionen: StubOptionen = {}): Promise<string> {
  server = createServer((req, res) => {
    const stuecke: Buffer[] = [];
    req.on('data', (c: Buffer) => stuecke.push(c));
    req.on('end', () => {
      const roh = Buffer.concat(stuecke).toString('utf8');
      const koerper = roh ? (JSON.parse(roh) as Record<string, unknown>) : {};

      if (req.url === '/api/tags') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ models: optionen.modelle ?? [] }));
        return;
      }
      if (req.url === '/api/chat') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(optionen.chat?.(koerper) ?? { model: 'stub', message: { content: '' } }));
        return;
      }
      if (req.url === '/api/pull') {
        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
        for (const zeile of optionen.pullZeilen ?? []) res.write(`${JSON.stringify(zeile)}\n`);
        res.end();
        return;
      }
      res.writeHead(404).end();
    });
  });

  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

describe('Erreichbarkeit und Modellliste', () => {
  it('erkennt einen laufenden Dienst und listet die Modelle', async () => {
    const url = await starteStub({
      modelle: [
        { name: 'qwen3:8b', size: 5_200_000_000, modified_at: '2026-08-01T10:00:00Z' },
        { name: 'llama3.1:8b', size: 4_900_000_000, modified_at: '2026-07-20T10:00:00Z' },
      ],
    });
    const admin = new OllamaAdmin(url);

    expect(await admin.erreichbar()).toBe(true);
    const modelle = await admin.modelle();
    expect(modelle.ok).toBe(true);
    if (!modelle.ok) return;
    expect(modelle.data.map((m) => m.name)).toEqual(['qwen3:8b', 'llama3.1:8b']);
    expect(modelle.data[0]?.groesseBytes).toBe(5_200_000_000);
  });

  it('meldet einen nicht laufenden Dienst, statt hängenzubleiben', async () => {
    // Port, auf dem nichts lauscht.
    const admin = new OllamaAdmin('http://127.0.0.1:1');
    expect(await admin.erreichbar(800)).toBe(false);
  });

  it('gibt für jedes System eine brauchbare Installationsanweisung', () => {
    const hinweis = OllamaAdmin.installationsHinweis();
    expect(hinweis.toLowerCase()).toContain('ollama');
    expect(hinweis.length).toBeGreaterThan(20);
  });
});

describe('Modell laden', () => {
  it('liest den Fortschrittsstrom und meldet ihn weiter', async () => {
    const url = await starteStub({
      pullZeilen: [
        { status: 'pulling manifest' },
        { status: 'downloading', completed: 250, total: 1000 },
        { status: 'downloading', completed: 1000, total: 1000 },
        { status: 'success' },
      ],
    });

    const stand: Array<{ status: string; anteil: number | null }> = [];
    const r = await new OllamaAdmin(url).ziehe('qwen3:8b', (s) => stand.push(s));

    expect(r.ok, r.ok ? '' : r.error.message).toBe(true);
    expect(stand.map((s) => s.status)).toEqual(['pulling manifest', 'downloading', 'downloading', 'success']);
    expect(stand[1]?.anteil).toBeCloseTo(0.25);
    expect(stand[2]?.anteil).toBe(1);
  });

  it('meldet einen Fehler aus dem Strom als Fehler', async () => {
    const url = await starteStub({
      pullZeilen: [{ status: 'pulling manifest' }, { error: 'model "gibtsnicht" not found' }],
    });

    const r = await new OllamaAdmin(url).ziehe('gibtsnicht');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('not found');
  });
});

describe('Werkzeugtauglichkeit', () => {
  it('erkennt ein geeignetes Modell', async () => {
    const url = await starteStub({
      chat: () => ({
        model: 'qwen3:8b',
        message: {
          content: '',
          tool_calls: [{ function: { name: 'hole_wetter', arguments: { ort: 'Hamburg' } } }],
        },
      }),
    });

    const r = await new OllamaAdmin(url).pruefeWerkzeugtauglichkeit('qwen3:8b');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.ruftWerkzeugeAuf).toBe(true);
    expect(r.data.argumenteKorrekt).toBe(true);
    expect(r.data.urteil).toContain('Geeignet');
  });

  it('entlarvt ein Modell, das den Werkzeugaufruf nur behauptet', async () => {
    const url = await starteStub({
      chat: () => ({
        model: 'plaudertasche:7b',
        message: { content: 'Ich rufe jetzt das Werkzeug hole_wetter für Hamburg auf.' },
      }),
    });

    const r = await new OllamaAdmin(url).pruefeWerkzeugtauglichkeit('plaudertasche:7b');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.ruftWerkzeugeAuf).toBe(false);
    expect(r.data.urteil).toContain('Ungeeignet');
    expect(r.data.stattdessen).toContain('Ich rufe jetzt');
  });

  it('erkennt falsch gefüllte Argumente', async () => {
    const url = await starteStub({
      chat: () => ({
        model: 'schludrig:7b',
        message: {
          content: '',
          tool_calls: [{ function: { name: 'hole_wetter', arguments: { ort: 'München' } } }],
        },
      }),
    });

    const r = await new OllamaAdmin(url).pruefeWerkzeugtauglichkeit('schludrig:7b');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.ruftWerkzeugeAuf).toBe(true);
    expect(r.data.argumenteKorrekt).toBe(false);
    expect(r.data.urteil).toContain('Eingeschränkt');
  });

  it('schickt die Werkzeuge überhaupt mit — sonst wäre die Prüfung wertlos', async () => {
    let gesehen: Record<string, unknown> = {};
    const url = await starteStub({
      chat: (koerper) => {
        gesehen = koerper;
        return { model: 'x', message: { content: 'ok' } };
      },
    });

    await new OllamaAdmin(url).pruefeWerkzeugtauglichkeit('x');
    expect(Array.isArray(gesehen.tools)).toBe(true);
    const werkzeuge = gesehen.tools as Array<{ function: { name: string } }>;
    expect(werkzeuge[0]?.function.name).toBe('hole_wetter');
  });
});

describe('Antwortauswertung des Providers', () => {
  it('nimmt Argumente auch als JSON-Zeichenkette entgegen', async () => {
    const url = await starteStub({
      chat: () => ({
        model: 'x',
        message: {
          content: '',
          tool_calls: [{ function: { name: 'such', arguments: '{"begriff":"Hamburg"}' } }],
        },
      }),
    });

    const antwort = await new OllamaProvider({ baseUrl: url, model: 'x' }).chat({
      messages: [{ role: 'user', content: 'test' }],
      tools: [{ name: 'such', description: 'x', parameters: { type: 'object', properties: {} } }],
    });

    expect(antwort.toolCalls).toHaveLength(1);
    expect(antwort.toolCalls[0]?.arguments).toEqual({ begriff: 'Hamburg' });
    expect(antwort.stopReason).toBe('tool_use');
  });
});

describe('Empfehlungen', () => {
  it('nennt nur Modelle mit Größen- und Speicherangabe', () => {
    expect(EMPFOHLENE_MODELLE.length).toBeGreaterThanOrEqual(3);
    for (const m of EMPFOHLENE_MODELLE) {
      expect(m.name).toMatch(/^[a-z0-9.\-]+:[a-z0-9.]+$/i);
      expect(m.groesse).toMatch(/GB/);
      expect(m.ram).toMatch(/GB/);
      expect(m.eignung.length).toBeGreaterThan(20);
    }
  });
});
