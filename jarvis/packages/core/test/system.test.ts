import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SystemService } from '../src/system/index.js';
import { bekannteProgramme, istUnbedenklicherName, startbefehle } from '../src/system/apps.js';
import { ok, err, type Result } from '../src/util/result.js';
import { silentLogger } from '../src/util/logger.js';

/**
 * Die Rechnersteuerung.
 *
 * Dateioperationen laufen hier gegen echte Dateien in einem temporaeren
 * Ordner -- nur der Programmstart wird abgefangen, weil ein Test keine
 * Fenster oeffnen soll.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jarvis-sys-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Startversuche mitschreiben; nur die genannten Programme „existieren". */
function starterMit(vorhanden: string[]) {
  const versuche: string[] = [];
  const launcher = async (befehl: string, args: string[]): Promise<Result<{ befehl: string }>> => {
    const zeile = [befehl, ...args].join(' ');
    versuche.push(zeile);
    const ziel = args[args.length - 1] ?? befehl;
    return vorhanden.some((v) => zeile.includes(v)) || vorhanden.includes(ziel)
      ? ok({ befehl: zeile })
      : err('NOT_FOUND', 'spawn ENOENT');
  };
  return { versuche, launcher };
}

function dienst(vorhanden: string[] = []): { system: SystemService; versuche: string[] } {
  const { versuche, launcher } = starterMit(vorhanden);
  return {
    system: new SystemService({ allowedRoots: [dir], logger: silentLogger, launcher }),
    versuche,
  };
}

describe('Programmnamen auflösen', () => {
  it('bildet allgemeine Bezeichnungen je System richtig ab', () => {
    expect(startbefehle('Excel', 'darwin')[0]).toEqual({
      befehl: 'open',
      args: ['-a', 'Microsoft Excel'],
      anzeige: 'Microsoft Excel',
    });
    expect(startbefehle('Excel', 'win32')[0]).toEqual({
      befehl: 'cmd',
      args: ['/c', 'start', '', 'excel'],
      anzeige: 'excel',
    });
    expect(startbefehle('Excel', 'linux')[0]).toEqual({ befehl: 'localc', args: [], anzeige: 'localc' });
  });

  it('bietet für "Browser" mehrere Kandidaten in sinnvoller Reihenfolge', () => {
    const linux = startbefehle('Browser', 'linux').map((k) => k.anzeige);
    expect(linux.length).toBeGreaterThan(2);
    expect(linux).toContain('firefox');

    const mac = startbefehle('browser', 'darwin').map((k) => k.anzeige);
    expect(mac[0]).toBe('Google Chrome');
    expect(mac).toContain('Safari');
  });

  it('versteht deutsche Bezeichnungen', () => {
    expect(startbefehle('Rechner', 'darwin')[0]?.anzeige).toBe('Calculator');
    expect(startbefehle('Dateien', 'win32')[0]?.anzeige).toBe('explorer');
    expect(startbefehle('Kalender', 'darwin')[0]?.anzeige).toBe('Calendar');
  });

  it('nutzt unter Windows den offiziellen Deep-Link, wo es einen gibt', () => {
    const kalender = startbefehle('Kalender', 'win32')[0];
    expect(kalender?.args).toContain('outlookcal:');
  });

  it('reicht unbekannte Programme unverändert durch', () => {
    // Die Tabelle ist eine Abkürzung, keine Grenze.
    expect(startbefehle('GIMP', 'darwin')[0]).toEqual({ befehl: 'open', args: ['-a', 'GIMP'], anzeige: 'GIMP' });
    expect(startbefehle('inkscape', 'linux')[0]?.befehl).toBe('inkscape');
  });

  it('weist Namen ab, aus denen eine Befehlskette werden könnte', () => {
    expect(istUnbedenklicherName('Google Chrome')).toBe(true);
    expect(istUnbedenklicherName('rm -rf /; echo')).toBe(false);
    expect(istUnbedenklicherName('foo && bar')).toBe(false);
    expect(istUnbedenklicherName('foo`whoami`')).toBe(false);
    expect(istUnbedenklicherName('$(id)')).toBe(false);
    expect(istUnbedenklicherName('')).toBe(false);
  });

  it('führt eine Liste bekannter Bezeichnungen für die Hilfe', () => {
    const namen = bekannteProgramme();
    expect(namen).toContain('browser');
    expect(namen).toContain('kalender');
    expect(namen.length).toBeGreaterThan(15);
  });
});

describe('Programm starten', () => {
  it('nimmt den ersten Kandidaten, der wirklich startet', async () => {
    // Chrome fehlt, Firefox ist da.
    const { system, versuche } = dienst(['firefox']);
    const r = await system.openApplication('Browser');

    expect(r.ok, r.ok ? '' : r.error.message).toBe(true);
    if (!r.ok) return;
    expect(r.data.gestartetAls).toContain('firefox');
    expect(r.data.programm).toBe('Browser');
    // Vorher wurde tatsächlich etwas anderes probiert.
    expect(versuche.length).toBeGreaterThan(1);
  });

  it('nennt die probierten Programme, wenn keines da ist', async () => {
    const { system } = dienst([]);
    const r = await system.openApplication('Browser');

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('NOT_FOUND');
    expect(r.error.hint).toContain('Probiert wurde');
  });

  it('startet gar nichts bei einem gefährlichen Namen', async () => {
    const { system, versuche } = dienst(['egal']);
    const r = await system.openApplication('chrome; rm -rf ~');

    expect(r.ok).toBe(false);
    expect(versuche).toHaveLength(0); // kein einziger Startversuch
  });
});

describe('Webadressen öffnen', () => {
  it('öffnet http und https', async () => {
    const { system } = dienst(['xdg-open', 'open', 'cmd']);
    const r = await system.openUrl('https://hermserviceteam.com/kontakt');
    expect(r.ok).toBe(true);
  });

  it('lehnt andere Schemata ab', async () => {
    const { system, versuche } = dienst(['xdg-open', 'open', 'cmd']);
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<h1>x']) {
      const r = await system.openUrl(url);
      expect(r.ok, url).toBe(false);
    }
    expect(versuche).toHaveLength(0);
  });
});

describe('Dateizugriff', () => {
  it('bleibt in den freigegebenen Verzeichnissen', () => {
    const { system } = dienst();
    expect(system.resolveSafePath(join(dir, 'notiz.txt')).ok).toBe(true);
    expect(system.resolveSafePath('/etc/passwd').ok).toBe(false);
    expect(system.resolveSafePath(join(dir, '..', '..', 'etc', 'passwd')).ok).toBe(false);
  });

  it('findet Dateien nach Namensbestandteil', async () => {
    mkdirSync(join(dir, 'Angebote'), { recursive: true });
    writeFileSync(join(dir, 'Angebote', 'Angebot-Nordbau.txt'), 'Inhalt');
    writeFileSync(join(dir, 'Angebote', 'Rechnung-Mai.txt'), 'Inhalt');
    writeFileSync(join(dir, 'notizen.md'), '# Notizen');

    const { system } = dienst();
    const r = await system.searchFiles({ query: 'angebot' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((f) => f.name)).toEqual(['Angebot-Nordbau.txt']);
    expect(r.data[0]?.sizeBytes).toBeGreaterThan(0);
  });

  it('liest Textdateien, aber keine Binärformate', async () => {
    writeFileSync(join(dir, 'brief.txt'), 'Sehr geehrte Damen und Herren');
    writeFileSync(join(dir, 'bild.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const { system } = dienst();
    const text = await system.readTextFile(join(dir, 'brief.txt'));
    expect(text.ok).toBe(true);
    if (text.ok) expect(text.data.inhalt).toContain('Sehr geehrte');

    const bild = await system.readTextFile(join(dir, 'bild.png'));
    expect(bild.ok).toBe(false);
  });

  it('legt Dateien an und löscht sie wieder', async () => {
    const { system } = dienst();
    const pfad = join(dir, 'unterordner', 'neu.txt');

    const geschrieben = await system.writeTextFile(pfad, 'Hallo');
    expect(geschrieben.ok).toBe(true);
    expect(await system.fileExists(pfad)).toBe(true);

    const geloescht = await system.deleteFile(pfad);
    expect(geloescht.ok).toBe(true);
    expect(await system.fileExists(pfad)).toBe(false);
  });

  it('löscht keine ganzen Ordner', async () => {
    mkdirSync(join(dir, 'wichtig'), { recursive: true });
    const { system } = dienst();
    const r = await system.deleteFile(join(dir, 'wichtig'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('PERMISSION_DENIED');
  });

  it('lässt sich die Verzeichnisse nachträglich setzen', () => {
    const { system } = dienst();
    const zweiter = mkdtempSync(join(tmpdir(), 'jarvis-sys2-'));
    try {
      expect(system.resolveSafePath(join(zweiter, 'x.txt')).ok).toBe(false);
      system.setRoots([dir, zweiter]);
      expect(system.resolveSafePath(join(zweiter, 'x.txt')).ok).toBe(true);
      expect(system.roots).toHaveLength(2);
    } finally {
      rmSync(zweiter, { recursive: true, force: true });
    }
  });
});
