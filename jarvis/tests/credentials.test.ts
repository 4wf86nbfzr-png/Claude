import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CredentialService, NullEncryptor, PassphraseEncryptor } from '../src/core/services/credentials';

const tresorPfad = () => join(mkdtempSync(join(tmpdir(), 'jarvis-tresor-')), 'tresor.json');

describe('Zugangsdaten', () => {
  it('legt Werte verschlüsselt ab und liest sie wieder', () => {
    const pfad = tresorPfad();
    const dienst = new CredentialService(pfad, new PassphraseEncryptor('passphrase-lang-genug'), {});
    dienst.set('ANTHROPIC_API_KEY', 'sk-geheim-123');
    expect(dienst.get('ANTHROPIC_API_KEY')).toBe('sk-geheim-123');
    expect(readFileSync(pfad, 'utf8')).not.toContain('sk-geheim-123');
  });

  it('gibt Umgebungsvariablen den Vorrang vor dem Tresor', () => {
    const pfad = tresorPfad();
    const dienst = new CredentialService(pfad, new PassphraseEncryptor('passphrase-lang-genug'), {
      ANTHROPIC_API_KEY: 'aus-der-umgebung'
    });
    dienst.set('ANTHROPIC_API_KEY', 'aus-dem-tresor');
    expect(dienst.get('ANTHROPIC_API_KEY')).toBe('aus-der-umgebung');
  });

  it('nutzt die Ersatzkette für gemeinsame Schlüssel', () => {
    const dienst = new CredentialService(tresorPfad(), new NullEncryptor(), { OPENAI_API_KEY: 'gemeinsam' });
    expect(dienst.getFirst('JARVIS_TTS_API_KEY', 'OPENAI_API_KEY')).toBe('gemeinsam');
    expect(dienst.getFirst('GIBT_ES_NICHT')).toBeNull();
  });

  it('verweigert das Speichern ohne Tresor mit klarer Begründung', () => {
    const dienst = new CredentialService(tresorPfad(), new NullEncryptor(), {});
    expect(() => dienst.set('SMTP_PASSWORD', 'geheim')).toThrow(/JARVIS_MASTER_KEY|Tresor/);
  });

  it('verrät in der Übersicht nie die Werte selbst', () => {
    const dienst = new CredentialService(tresorPfad(), new PassphraseEncryptor('passphrase-lang-genug'), {
      BRAVE_API_KEY: 'umgebungswert'
    });
    dienst.set('SMTP_PASSWORD', 'tresorwert');
    const uebersicht = JSON.stringify(dienst.describe());
    expect(uebersicht).not.toContain('umgebungswert');
    expect(uebersicht).not.toContain('tresorwert');
    const brave = dienst.describe().find((e) => e.name === 'BRAVE_API_KEY');
    const smtp = dienst.describe().find((e) => e.name === 'SMTP_PASSWORD');
    const fehlend = dienst.describe().find((e) => e.name === 'TAVILY_API_KEY');
    expect(brave?.source).toBe('umgebung');
    expect(smtp?.source).toBe('tresor');
    expect(fehlend?.source).toBe('fehlt');
  });

  it('entfernt Werte wieder', () => {
    const dienst = new CredentialService(tresorPfad(), new PassphraseEncryptor('passphrase-lang-genug'), {});
    dienst.set('SMTP_PASSWORD', 'geheim');
    dienst.remove('SMTP_PASSWORD');
    expect(dienst.get('SMTP_PASSWORD')).toBeNull();
  });
});
