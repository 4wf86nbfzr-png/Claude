import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeConfig, loadConfig, loadDotEnv } from './config.js';

function envFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'jarvis-cfg-'));
  const path = join(dir, '.env');
  writeFileSync(path, content);
  return path;
}

const BASE = {
  JARVIS_OWNER_PHONE_E164: '+491771459965',
  JARVIS_SIM_PHONE_E164: '+491634789597',
};

describe('.env einlesen', () => {
  it('schneidet einen Kommentar am Zeilenende ab', () => {
    const path = envFile('JARVIS_MODE=simulation      # simulation | dry-run | live\n');
    expect(loadDotEnv(path)['JARVIS_MODE']).toBe('simulation');
  });

  it('laesst ein # im Wert stehen, wenn kein Leerraum davor ist', () => {
    const path = envFile('X=abc#def\n');
    expect(loadDotEnv(path)['X']).toBe('abc#def');
  });

  it('erhaelt Anfuehrungszeichen-Werte unveraendert', () => {
    const path = envFile('X="wert mit # und leerzeichen"\n');
    expect(loadDotEnv(path)['X']).toBe('wert mit # und leerzeichen');
  });

  it('ignoriert Kommentarzeilen und Leerzeilen', () => {
    const path = envFile('# Kommentar\n\nA=1\n');
    expect(loadDotEnv(path)).toEqual({ A: '1' });
  });
});

describe('Konfiguration pruefen', () => {
  it('nimmt eine gueltige Grundkonfiguration an', () => {
    const c = loadConfig({ env: BASE, dotEnvPath: '/nicht/vorhanden' });
    expect(c.mode).toBe('simulation');
    expect(c.behaviour.timezone).toBe('Europe/Berlin');
    expect(c.privacy.storeRawAudio).toBe(false);
  });

  it('lehnt eine Rufnummer ohne E.164-Format ab', () => {
    expect(() =>
      loadConfig({ env: { ...BASE, JARVIS_OWNER_PHONE_E164: '01771459965' }, dotEnvPath: '/x' }),
    ).toThrow(/E\.164/);
  });

  it('verhindert, dass Jarvis sich selbst anruft', () => {
    expect(() =>
      loadConfig({
        env: { ...BASE, JARVIS_SIM_PHONE_E164: BASE.JARVIS_OWNER_PHONE_E164 },
        dotEnvPath: '/x',
      }),
    ).toThrow(/selbst anrufen/);
  });

  it('erzwingt Roh-Audio aus, auch wenn die Umgebung etwas anderes sagt', () => {
    const c = loadConfig({
      env: { ...BASE, STORE_RAW_AUDIO: 'true', NODE_ENV: 'production' },
      dotEnvPath: '/x',
    });
    expect(c.privacy.storeRawAudio).toBe(false);
  });

  it('erzwingt in Produktion, dass keine Nachrichtentexte geloggt werden', () => {
    const c = loadConfig({
      env: { ...BASE, LOG_MESSAGE_BODIES: 'true', NODE_ENV: 'production' },
      dotEnvPath: '/x',
    });
    expect(c.privacy.logMessageBodies).toBe(false);
  });

  it('verlangt im Live-Betrieb eine verschluesselte Datenbank', () => {
    expect(() =>
      loadConfig({
        env: {
          ...BASE,
          JARVIS_MODE: 'live',
          MS_CLIENT_ID: 'abc',
          WHISPER_BIN: '/x',
          PIPER_BIN: '/y',
          JARVIS_DB_CIPHER: 'false',
        },
        dotEnvPath: '/x',
      }),
    ).toThrow(/JARVIS_DB_CIPHER/);
  });

  it('verlangt im Live-Betrieb die Sprachprogramme', () => {
    expect(() =>
      loadConfig({
        env: { ...BASE, JARVIS_MODE: 'live', MS_CLIENT_ID: 'abc', JARVIS_DB_CIPHER: 'true' },
        dotEnvPath: '/x',
      }),
    ).toThrow(/WHISPER_BIN/);
  });

  it('lehnt ein unsinniges Anruflimit ab', () => {
    expect(() => loadConfig({ env: { ...BASE, CALL_MAX_PER_HOUR: '0' }, dotEnvPath: '/x' })).toThrow();
  });
});

describe('Diagnoseausgabe', () => {
  it('gibt Rufnummern nur maskiert aus', () => {
    const c = loadConfig({ env: BASE, dotEnvPath: '/x' });
    const described = JSON.stringify(describeConfig(c));

    expect(described).not.toContain('1771459965');
    expect(described).not.toContain('1634789597');
    expect(described).toContain('***');
  });
});
