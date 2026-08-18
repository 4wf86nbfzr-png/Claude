import { afterEach, describe, expect, it } from 'vitest';
import { FakeLlm, makeJarvis, type TestJarvis } from './fakes.js';
import { COMPANY_RESEARCH_AGENT, MAIL_AGENT, OUTREACH_AGENT, SYSTEM_AGENT } from '../src/agents/index.js';

let t: TestJarvis;
afterEach(() => t?.dispose());

describe('Werkzeugzuschnitt der Agenten', () => {
  it('gibt keinem Agenten ein Versandwerkzeug', () => {
    t = makeJarvis();
    for (const agent of [COMPANY_RESEARCH_AGENT, MAIL_AGENT, OUTREACH_AGENT, SYSTEM_AGENT]) {
      expect(agent.tools, `${agent.name} darf nicht selbst versenden`).not.toContain('send_email');
    }
  });

  it('trennt die Zuständigkeiten sauber', () => {
    t = makeJarvis();
    expect(MAIL_AGENT.tools).not.toContain('delete_file');
    expect(SYSTEM_AGENT.tools).not.toContain('create_email_draft');
    expect(COMPANY_RESEARCH_AGENT.tools).not.toContain('create_email_draft');
  });

  it('kennt alle Werkzeuge, die es auch wirklich gibt', () => {
    t = makeJarvis();
    const vorhanden = new Set(t.jarvis.registry.names());
    for (const agent of [COMPANY_RESEARCH_AGENT, MAIL_AGENT, OUTREACH_AGENT, SYSTEM_AGENT]) {
      for (const tool of agent.tools) {
        expect(vorhanden.has(tool), `${agent.name} verweist auf unbekanntes Werkzeug "${tool}"`).toBe(true);
      }
    }
  });
});

describe('Agentenschleife', () => {
  it('führt Werkzeuge aus und beantwortet die Frage danach', async () => {
    const llm = new FakeLlm([
      { toolCalls: [{ id: 'a1', name: 'get_system_status', arguments: {} }], stopReason: 'tool_use' },
      { text: 'Alles eingerichtet: Versand über Attrappe, Suche über DuckDuckGo.' },
    ]);
    t = makeJarvis({ llm });

    const r = await t.jarvis.ask('Wie ist der Stand der Einrichtung?');
    expect(r.ok, r.ok ? '' : r.error.message).toBe(true);
    if (!r.ok) return;

    expect(r.data.antwort).toContain('eingerichtet');
    // Das Werkzeug wurde tatsaechlich aufgerufen und protokolliert.
    expect(t.jarvis.audit.list({ limit: 20 }).some((l) => l.action === 'tool.get_system_status')).toBe(true);
  });

  it('lässt einen Agenten kein fremdes Werkzeug benutzen', async () => {
    // JarvisCore soll ein Werkzeug rufen, das nicht in seiner Liste steht.
    const llm = new FakeLlm([
      { toolCalls: [{ id: 'x1', name: 'delete_file', arguments: { pfad: '~/Dokumente/wichtig.txt' } }], stopReason: 'tool_use' },
      { text: 'Das darf ich hier nicht.' },
    ]);
    t = makeJarvis({ llm });

    await t.jarvis.ask('Lösche wichtig.txt');

    // Zweite Anfrage ans Modell enthaelt die Ablehnung als Werkzeugergebnis.
    const zweite = llm.requests[1];
    const toolAntwort = zweite?.messages.find((m) => m.role === 'tool');
    expect(toolAntwort?.content).toContain('PERMISSION_DENIED');
    expect(toolAntwort?.content).toContain('steht JarvisCore nicht zur Verfügung');
  });

  it('bricht nach der Schrittgrenze ab, statt endlos zu laufen', async () => {
    const llm = new FakeLlm();
    // Immer wieder derselbe Werkzeugaufruf.
    for (let i = 0; i < 40; i += 1) {
      llm.enqueue({ toolCalls: [{ id: `s${i}`, name: 'list_pending_approvals', arguments: {} }], stopReason: 'tool_use' });
    }
    t = makeJarvis({ llm });

    const r = await t.jarvis.ask('Zeig mir die Freigaben');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.antwort).toContain('abgebrochen');
    expect(llm.requests.length).toBeLessThanOrEqual(17);
  });

  it('meldet einen Ausfall des Sprachmodells als Fehler, nicht als Antwort', async () => {
    t = makeJarvis();
    const kaputt = {
      id: 'anthropic' as const,
      defaultModel: 'x',
      isConfigured: () => true,
      missingConfigHint: () => null,
      chat: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    };
    (t.jarvis.context as { llm: typeof kaputt }).llm = kaputt;

    const r = await t.jarvis.ask('Hallo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('ECONNREFUSED');
  });
});

describe('Delegation', () => {
  it('beauftragt einen Fachagenten und gibt dessen Ergebnis zurück', async () => {
    const llm = new FakeLlm([
      // JarvisCore delegiert ...
      {
        toolCalls: [
          {
            id: 'd1',
            name: 'delegate_to_agent',
            arguments: { agent: 'MailAgent', auftrag: 'Zeige alle Entwürfe mit Status Entwurf.' },
          },
        ],
        stopReason: 'tool_use',
      },
      // ... der MailAgent ruft sein Werkzeug ...
      { toolCalls: [{ id: 'm1', name: 'list_email_drafts', arguments: {} }], stopReason: 'tool_use' },
      // ... und antwortet.
      { text: 'Es gibt derzeit keine Entwürfe.' },
      // JarvisCore fasst zusammen.
      { text: 'Zurzeit liegen keine Entwürfe vor.' },
    ]);
    t = makeJarvis({ llm });

    const r = await t.jarvis.ask('Welche Entwürfe habe ich?');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.antwort).toContain('keine Entwürfe');

    const log = t.jarvis.audit.list({ limit: 30 }).map((l) => l.action);
    expect(log).toContain('agent.beauftragt');
    expect(log).toContain('tool.list_email_drafts');
  });
});
