import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeLlm, makeJarvis, type TestJarvis } from './fakes.js';
import { ok, type Result } from '../src/util/result.js';

/**
 * Der ganze Weg: Anweisung → JarvisCore → SystemAgent → Werkzeug → Tat.
 *
 * Diese Tests belegen, dass aus einem Satz wirklich etwas auf dem Rechner
 * passiert -- und dass die Grenzen dabei halten. Nur der Prozessstart wird
 * abgefangen; Dateien werden echt geschrieben und gelesen.
 */

let t: TestJarvis;
afterEach(() => t?.dispose());

/** Merkt sich Startversuche, ohne wirklich ein Fenster zu öffnen. */
function starterAttrappe(vorhanden: string[]) {
  const gestartet: string[] = [];
  const launcher = async (befehl: string, args: string[]): Promise<Result<{ befehl: string }>> => {
    const zeile = [befehl, ...args].join(' ');
    if (vorhanden.some((v) => zeile.includes(v))) {
      gestartet.push(zeile);
      return ok({ befehl: zeile });
    }
    return { ok: false, error: { code: 'NOT_FOUND', message: 'spawn ENOENT' } };
  };
  return { gestartet, launcher };
}

describe('„Öffne mir den Browser"', () => {
  it('startet tatsächlich ein Programm', async () => {
    const { gestartet, launcher } = starterAttrappe(['firefox', 'chrome', 'Chrome']);

    const llm = new FakeLlm([
      // JarvisCore erkennt: das ist Sache des SystemAgent.
      {
        toolCalls: [
          {
            id: 'd1',
            name: 'delegate_to_agent',
            arguments: { agent: 'SystemAgent', auftrag: 'Öffne den Standardbrowser des Benutzers.' },
          },
        ],
        stopReason: 'tool_use',
      },
      // Der SystemAgent greift zum Werkzeug.
      {
        toolCalls: [{ id: 's1', name: 'open_application', arguments: { programm: 'Browser' } }],
        stopReason: 'tool_use',
      },
      { text: 'Der Browser ist offen.' },
      { text: 'Ich habe den Browser geöffnet.' },
    ]);

    t = makeJarvis({ llm, systemLauncher: launcher });
    const r = await t.jarvis.ask('Öffne mir den Browser');

    expect(r.ok, r.ok ? '' : r.error.message).toBe(true);
    expect(gestartet.length, 'Es muss wirklich ein Startversuch stattgefunden haben').toBe(1);

    // Und es steht nachvollziehbar im Protokoll.
    const log = t.jarvis.audit.list({ limit: 30 });
    expect(log.some((l) => l.action === 'system.programm')).toBe(true);
    expect(log.find((l) => l.action === 'system.programm')?.summary).toContain('gestartet');
  });

  it('meldet ehrlich, wenn nichts installiert ist — und erfindet keinen Erfolg', async () => {
    const { gestartet, launcher } = starterAttrappe([]); // nichts ist da

    const llm = new FakeLlm([
      {
        toolCalls: [{ id: 's1', name: 'open_application', arguments: { programm: 'Browser' } }],
        stopReason: 'tool_use',
      },
      { text: 'Antwort' },
    ]);
    t = makeJarvis({ llm, systemLauncher: launcher });

    // Direkt über die Registry, damit das Werkzeugergebnis unverfälscht sichtbar ist.
    const ergebnis = await t.jarvis.registry.call('open_application', { programm: 'Browser' }, t.jarvis.context);

    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) return;
    expect(ergebnis.error.hint).toContain('Probiert wurde');
    expect(gestartet).toHaveLength(0);
  });
});

describe('„Such mir die Datei X und lies sie vor"', () => {
  it('findet und liest eine echte Datei', async () => {
    t = makeJarvis({ llm: new FakeLlm([{ text: 'ok' }]) });
    writeFileSync(join(t.dir, 'Angebot-Nordbau.txt'), 'Angebot über Baustellenbewachung, 12 Monate.');

    const gefunden = await t.jarvis.registry.call('search_files', { suchbegriff: 'angebot' }, t.jarvis.context);
    expect(gefunden.ok).toBe(true);
    if (!gefunden.ok) return;
    const treffer = (gefunden.data as { dateien: Array<{ pfad: string; name: string }> }).dateien;
    expect(treffer[0]?.name).toBe('Angebot-Nordbau.txt');

    const gelesen = await t.jarvis.registry.call('read_file', { pfad: treffer[0]!.pfad }, t.jarvis.context);
    expect(gelesen.ok).toBe(true);
    if (gelesen.ok) {
      expect((gelesen.data as { inhalt: string }).inhalt).toContain('Baustellenbewachung');
    }
  });

  it('kommt nicht an Dateien außerhalb der Freigabe', async () => {
    t = makeJarvis({ llm: new FakeLlm([{ text: 'ok' }]) });

    const r = await t.jarvis.registry.call('read_file', { pfad: '/etc/passwd' }, t.jarvis.context);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('PERMISSION_DENIED');
      expect(r.error.hint).toContain('Freigegeben sind');
    }
  });
});

describe('Löschen bleibt freigabepflichtig', () => {
  it('löscht nicht sofort, sondern legt die Entscheidung vor', async () => {
    t = makeJarvis({ llm: new FakeLlm([{ text: 'ok' }]) });
    const pfad = join(t.dir, 'wichtig.txt');
    writeFileSync(pfad, 'Bitte nicht verlieren');

    const r = await t.jarvis.registry.call('delete_file', { pfad }, t.jarvis.context);
    expect(r.ok).toBe(true);

    // Datei ist noch da, eine Freigabe wartet.
    expect(await t.jarvis.system.fileExists(pfad)).toBe(true);
    const offen = t.jarvis.pendingApprovals();
    expect(offen).toHaveLength(1);
    expect(offen[0]?.action_type).toBe('datei.loeschen');

    // Erst die Freigabe löscht wirklich.
    await t.jarvis.approve(offen[0]!.id);
    expect(await t.jarvis.system.fileExists(pfad)).toBe(false);
  });
});

describe('Der SystemAgent kennt seine Grenzen', () => {
  it('bekommt die freigegebenen Verzeichnisse in seinen Prompt geschrieben', async () => {
    t = makeJarvis({ llm: new FakeLlm([{ text: 'ok' }]) });
    const { systemAgentPrompt } = await import('../src/agents/prompts.js');
    const prompt = systemAgentPrompt(t.jarvis.context);

    expect(prompt).toContain(t.dir);
    expect(prompt).toContain('Löschen und Überschreiben führst du nicht aus');
    expect(prompt).toContain('keine Maus- oder Tastatursteuerung');
  });
});
