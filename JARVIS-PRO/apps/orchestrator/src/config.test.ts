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

/**
 * Erfundene Rufnummern. Echte Nummern gehoeren nicht in die
 * Versionsverwaltung - auch nicht in einen Test. Die CI prueft das.
 */
const BASE = {
  JARVIS_OWNER_PHONE_E164: '+4915112345678',
  JARVIS_SIM_PHONE_E164: '+4915199998888',
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
      loadConfig({ env: { ...BASE, JARVIS_OWNER_PHONE_E164: '015112345678' }, dotEnvPath: '/x' }),
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

    expect(described).not.toContain('15112345678');
    expect(described).not.toContain('15199998888');
    expect(described).toContain('***');
  });
});

describe('Kanalwahl', () => {
  it('laesst den reinen Chatbetrieb ohne Rufnummern zu', () => {
    const c = loadConfig({
      env: {
        JARVIS_KANAL: 'chat',
        JARVIS_OWNER_WA_ID: '4915112345678',
        WHATSAPP_PHONE_NUMBER_ID: '111222333',
      },
      dotEnvPath: envFile(''),
    });
    expect(c.kanal).toBe('chat');
    expect(c.ownerPhone).toBe('');
    expect(c.chat.ownerWaId).toBe('4915112345678');
  });

  it('verlangt im Chatbetrieb die eigene WhatsApp-Nummer', () => {
    expect(() =>
      loadConfig({ env: { JARVIS_KANAL: 'chat' }, dotEnvPath: envFile('') }),
    ).toThrow(/JARVIS_OWNER_WA_ID/);
  });

  it('verlangt im Telefonbetrieb beide Rufnummern', () => {
    expect(() =>
      loadConfig({
        env: { JARVIS_KANAL: 'telefon', JARVIS_OWNER_PHONE_E164: '+4915112345678' },
        dotEnvPath: envFile(''),
      }),
    ).toThrow(/JARVIS_SIM_PHONE_E164/);
  });

  it('weist es ab, wenn Jarvis mit sich selbst schreiben wuerde', () => {
    expect(() =>
      loadConfig({
        env: {
          JARVIS_KANAL: 'chat',
          JARVIS_OWNER_WA_ID: '111222333',
          WHATSAPP_PHONE_NUMBER_ID: '111222333',
        },
        dotEnvPath: envFile(''),
      }),
    ).toThrow(/mit sich selbst/);
  });

  it('nimmt die eigene WhatsApp-Nummer notfalls aus der Rufnummer', () => {
    const c = loadConfig({
      env: { ...BASE, JARVIS_KANAL: 'beide', WHATSAPP_PHONE_NUMBER_ID: '111222333' },
      dotEnvPath: envFile(''),
    });
    // Aus '+4915112345678' wird '4915112345678' - Meta liefert die Nummer
    // ohne Plus und ohne Trennzeichen.
    expect(c.chat.ownerWaId).toBe('4915112345678');
  });

  it('nimmt den Einmalcode als zweiten Faktor entgegen', () => {
    const c = loadConfig({
      env: { ...BASE, JARVIS_CHAT_SECOND_FACTOR: 'totp', WHATSAPP_PHONE_NUMBER_ID: '111222333' },
      dotEnvPath: envFile(''),
    });
    expect(c.chat.secondFactor).toBe('totp');
  });

  it('maskiert die eigene WhatsApp-Nummer im Diagnosebericht', () => {
    const c = loadConfig({
      env: { ...BASE, WHATSAPP_PHONE_NUMBER_ID: '111222333' },
      dotEnvPath: envFile(''),
    });
    const bericht = JSON.stringify(describeConfig(c));
    expect(bericht).not.toContain('4915112345678');
    expect(bericht).toContain('***');
  });
});
