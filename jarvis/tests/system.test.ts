import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SystemService } from '../src/core/services/system';

const service = (wurzel: string, starter?: (b: string, a: string[]) => Promise<void>) =>
  new SystemService({ erlaubteWurzeln: [wurzel], ...(starter ? { starter } : {}) });

describe('Dateizugriff', () => {
  it('erlaubt nur Pfade innerhalb der freigegebenen Verzeichnisse', () => {
    const wurzel = mkdtempSync(join(tmpdir(), 'jarvis-fs-'));
    const s = service(wurzel);
    expect(s.pruefePfad(join(wurzel, 'unterordner', 'datei.txt'))).toContain(wurzel);
    expect(() => s.pruefePfad('/etc/passwd')).toThrow(/nicht erlaubt/);
    expect(() => s.pruefePfad(join(wurzel, '..', 'anderswo.txt'))).toThrow(/nicht erlaubt/);
  });

  it('lässt sich nicht durch einen Präfix-Trick austricksen', () => {
    const wurzel = mkdtempSync(join(tmpdir(), 'jarvis-fs-'));
    const s = service(wurzel);
    expect(() => s.pruefePfad(`${wurzel}-daneben/datei.txt`)).toThrow(/nicht erlaubt/);
  });

  it('legt neue Dateien an, überschreibt aber nicht ungefragt', async () => {
    const wurzel = mkdtempSync(join(tmpdir(), 'jarvis-fs-'));
    const s = service(wurzel);
    const pfad = join(wurzel, 'notiz.txt');
    await s.dateiSchreiben(pfad, 'erster Inhalt', false);
    expect(readFileSync(pfad, 'utf8')).toBe('erster Inhalt');
    await expect(s.dateiSchreiben(pfad, 'zweiter Inhalt', false)).rejects.toThrow(/existiert bereits/);
    await s.dateiSchreiben(pfad, 'zweiter Inhalt', true);
    expect(readFileSync(pfad, 'utf8')).toBe('zweiter Inhalt');
  });

  it('findet Dateien nach Namensbestandteil', async () => {
    const wurzel = mkdtempSync(join(tmpdir(), 'jarvis-fs-'));
    writeFileSync(join(wurzel, 'angebot-2026.pdf'), 'x');
    writeFileSync(join(wurzel, 'rechnung.txt'), 'x');
    const treffer = await service(wurzel).dateiSuche('angebot');
    expect(treffer).toHaveLength(1);
    expect(treffer[0]?.name).toBe('angebot-2026.pdf');
  });
});

describe('Programme und Adressen öffnen', () => {
  it('übergibt den Programmnamen ohne Shell', async () => {
    const aufrufe: { befehl: string; argumente: string[] }[] = [];
    const s = service(tmpdir(), async (befehl, argumente) => {
      aufrufe.push({ befehl, argumente });
    });
    await s.oeffneProgramm('firefox');
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0]?.argumente.join(' ')).not.toContain(';');
  });

  it('lehnt Programmnamen mit eingebettetem Befehl ab', async () => {
    const s = service(tmpdir(), async () => undefined);
    await expect(s.oeffneProgramm('firefox; rm -rf /')).rejects.toThrow(/Ungültiger Programmname/);
  });

  it('öffnet nur Web- und Mailadressen', async () => {
    const s = service(tmpdir(), async () => undefined);
    await expect(s.oeffneUrl('https://hermserviceteam.com')).resolves.toBeUndefined();
    await expect(s.oeffneUrl('file:///etc/passwd')).rejects.toThrow(/nicht geöffnet/);
  });
});

describe('Anhänge', () => {
  it('lässt Dokumente zu und ausführbare Dateien nicht', () => {
    expect(SystemService.anhangErlaubt('/tmp/angebot.pdf')).toBe(true);
    expect(SystemService.anhangErlaubt('/tmp/bild.JPG')).toBe(true);
    expect(SystemService.anhangErlaubt('/tmp/programm.exe')).toBe(false);
    expect(SystemService.anhangErlaubt('/tmp/skript.sh')).toBe(false);
  });
});
