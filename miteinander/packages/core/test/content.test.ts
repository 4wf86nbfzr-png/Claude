import { describe, expect, it } from 'vitest';
import { DgsRegistry, REQUIRED_DGS_KEYS, dgsStatusNotice } from '../src/content/dgs';
import { EasyLanguageRegistry, checkEasyLanguage } from '../src/content/easy-language';

describe('Gebärdensprach-Inhalte', () => {
  it('behauptet im Entwicklungsstand keine Vollständigkeit', () => {
    const registry = new DgsRegistry();
    expect(registry.coverage().approved).toBe(0);
    expect(registry.missing().length).toBe(REQUIRED_DGS_KEYS.length);
  });

  it('zeigt einen ehrlichen Hinweis, solange ein Video fehlt', () => {
    const registry = new DgsRegistry();
    const notice = dgsStatusNotice(registry.get('booking.summary'));
    expect(notice).toContain('noch kein Video');
  });

  it('gibt ohne Video keine Freigabe', () => {
    const registry = new DgsRegistry();
    expect(() => registry.approve('booking.summary', 'Prüfperson', '2026-03-02')).toThrow(
      /ohne produziertes Video/i,
    );
  });

  it('verlangt Untertitel und Transkript', () => {
    const registry = new DgsRegistry();
    registry.upsertVideo('booking.summary', 'v.mp4', '', '');
    expect(() => registry.approve('booking.summary', 'Prüfperson', '2026-03-02')).toThrow(
      /Untertitel und ein Transkript/,
    );
  });

  it('verlangt den Namen der prüfenden Person', () => {
    const registry = new DgsRegistry();
    registry.upsertVideo('booking.summary', 'v.mp4', 'v.vtt', 'Transkript');
    expect(() => registry.approve('booking.summary', '  ', '2026-03-02')).toThrow(/Namen/);
  });

  it('gilt erst nach fachlicher Freigabe als geprüft', () => {
    const registry = new DgsRegistry();
    registry.upsertVideo('booking.summary', 'v.mp4', 'v.vtt', 'Transkript');
    expect(registry.isApproved('booking.summary')).toBe(false);
    registry.approve('booking.summary', 'M. Petersen, DGS-Muttersprachlerin', '2026-03-02');
    expect(registry.isApproved('booking.summary')).toBe(true);
    expect(dgsStatusNotice(registry.get('booking.summary'))).toBeNull();
  });

  it('setzt die Prüfung zurück, wenn ein neues Video eingespielt wird', () => {
    const registry = new DgsRegistry();
    registry.upsertVideo('help.overview', 'v1.mp4', 'v1.vtt', 'Text');
    registry.approve('help.overview', 'Prüfperson', '2026-03-02');
    const neu = registry.upsertVideo('help.overview', 'v2.mp4', 'v2.vtt', 'Text neu');
    expect(neu.status).toBe('in_review');
    expect(neu.version).toBe(2);
    expect(registry.isApproved('help.overview')).toBe(false);
  });

  it('deckt alle sicherheits- und vertragsrelevanten Abläufe ab', () => {
    for (const key of ['booking.summary', 'payment.overview', 'safety.emergency', 'privacy.overview', 'complaint.how_to']) {
      expect(REQUIRED_DGS_KEYS).toContain(key as (typeof REQUIRED_DGS_KEYS)[number]);
    }
  });
});

describe('Leichte Sprache', () => {
  it('kennzeichnet ungeprüfte Texte als Entwurf', () => {
    const registry = new EasyLanguageRegistry();
    const result = registry.resolve('home.title', 'Was möchten Sie tun?');
    expect(result.reviewed).toBe(false);
    expect(result.notice).toContain('Entwurf');
  });

  it('meldet auch fehlende Texte ehrlich zurück', () => {
    const registry = new EasyLanguageRegistry();
    const result = registry.resolve('gibt.es.nicht', 'Ersatztext');
    expect(result.text).toBe('Ersatztext');
    expect(result.notice).not.toBeNull();
  });

  it('nimmt eine Freigabe nur mit benannter Prüfgruppe an', () => {
    const registry = new EasyLanguageRegistry();
    expect(() => registry.approve('home.title', '', '2026-03-02')).toThrow(/Prüfgruppe/);
    registry.approve('home.title', 'Prüfgruppe Hamburg', '2026-03-02');
    expect(registry.resolve('home.title', '').reviewed).toBe(true);
  });

  it('findet zu lange Sätze', () => {
    const findings = checkEasyLanguage(
      'Wenn Sie eine Unterstützung suchen und dabei mehrere Wünsche gleichzeitig angeben möchten, dann geht das hier.',
    );
    expect(findings.some((f) => f.rule === 'kurze_saetze')).toBe(true);
  });

  it('findet lange Wörter ohne Trennung', () => {
    const findings = checkEasyLanguage('Bitte lesen Sie die Barrierefreiheitserklaerung.');
    expect(findings.some((f) => f.rule === 'lange_woerter')).toBe(true);
  });

  it('findet Abkürzungen', () => {
    expect(checkEasyLanguage('Das gilt z.B. hier.').some((f) => f.rule === 'keine_abkuerzungen')).toBe(true);
  });

  it('lässt gute Sätze durchgehen', () => {
    expect(checkEasyLanguage('Sie brauchen Hilfe.\nWir suchen eine Person für Sie.')).toEqual([]);
  });
});
