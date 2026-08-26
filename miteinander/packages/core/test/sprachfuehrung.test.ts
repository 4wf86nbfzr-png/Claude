import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_SAETZE,
  SICHER_AB,
  begruessung,
  ersteWunsch,
  kategorienFuerEntwurf,
  normalisiere,
} from '../src/voice/wunsch';
import { SERVICE_CATEGORIES } from '../src/domain/service-categories';

describe('Sprachführung: was jemand sagt', () => {
  it('macht aus einem Satz eine Kategorie und ein Ziel', () => {
    const wunsch = ersteWunsch('Ich möchte einen begleiteten Arztbesuch');
    expect(wunsch.art).toBe('dienstleistung');
    expect(wunsch.kategorien[0]).toBe('begleitung_termine');
    expect(wunsch.ziel).toBe('/suchen/anfrage');
    expect(wunsch.sicherheit).toBeGreaterThanOrEqual(SICHER_AB);
  });

  it('erkennt den Beispielsatz aus der Begrüßung', () => {
    const wunsch = ersteWunsch('Ich möchte zum Arzt begleitet werden.');
    expect(wunsch.kategorien[0]).toBe('begleitung_termine');
  });

  it('versteht alle Beispielsätze, die auf dem Bildschirm stehen', () => {
    for (const satz of BEISPIEL_SAETZE) {
      const wunsch = ersteWunsch(satz);
      expect(wunsch.art, satz).not.toBe('unklar');
      expect(wunsch.sicherheit, satz).toBeGreaterThanOrEqual(SICHER_AB);
    }
  });

  it('prüft den Notfall vor jeder Kategorie', () => {
    // "Notruf" und "Arzt" im selben Satz: der Notruf gewinnt.
    const wunsch = ersteWunsch('Ich brauche einen Notruf, mein Arzt ist nicht da');
    expect(wunsch.art).toBe('notfall');
    expect(wunsch.kategorien).toEqual([]);
    expect(wunsch.antwort).toContain('112');
    expect(wunsch.antwort).toContain('kein Notruf');
  });

  it('führt niemanden bei einer erlaubnispflichtigen Leistung in die Irre', () => {
    const wunsch = ersteWunsch('Ich brauche Hilfe mit meinen Tabletten');
    expect(wunsch.kategorien[0]).toBe('medizinische_unterstuetzung');
    expect(wunsch.antwort).toMatch(/Fachkraft/);
  });

  it('trennt die anderen Absichten voneinander', () => {
    expect(ersteWunsch('Ich möchte selbst helfen').art).toBe('anbieten');
    expect(ersteWunsch('Ich bin die Betreuerin meiner Mutter').art).toBe('verantwortlich');
    expect(ersteWunsch('Mach die Schrift größer').art).toBe('bedienhilfen');
    expect(ersteWunsch('Welchen Termin habe ich morgen?').art).toBe('termine');
  });

  it('rät nicht, wenn es nichts zu erkennen gibt', () => {
    const wunsch = ersteWunsch('Blauer Montag Fahrrad');
    expect(wunsch.art).toBe('unklar');
    expect(wunsch.ziel).toBe('');
    expect(wunsch.sicherheit).toBeLessThan(SICHER_AB);
    // Was verstanden wurde, steht immer im Text -- sonst weiß niemand, warum.
    expect(wunsch.antwort).toContain('Blauer Montag Fahrrad');
  });

  it('sagt bei Stille, dass nichts angekommen ist', () => {
    const wunsch = ersteWunsch('   ');
    expect(wunsch.art).toBe('unklar');
    expect(wunsch.sicherheit).toBe(0);
    expect(wunsch.antwort).toMatch(/nichts verstanden/i);
  });

  it('gibt immer wieder, was verstanden wurde', () => {
    expect(ersteWunsch('Ich möchte einkaufen gehen').gehoert).toBe('Ich möchte einkaufen gehen');
  });

  it('ist unabhängig von Umlauten, Groß-/Kleinschreibung und Satzzeichen', () => {
    expect(normalisiere('Ärztin?!')).toBe('aerztin');
    const mit = ersteWunsch('Ich möchte zur Ärztin.');
    const ohne = ersteWunsch('ich moechte zur aerztin');
    expect(mit.kategorien).toEqual(ohne.kategorien);
  });

  it('sortiert mehrere Treffer, ohne den Rest zu verlieren', () => {
    const wunsch = ersteWunsch('Ich möchte einkaufen und dann spazieren gehen');
    expect(wunsch.kategorien).toContain('einkaufen');
    expect(wunsch.kategorien).toContain('spaziergang');
  });
});

describe('Sprachführung: Übergabe an die App', () => {
  it('übernimmt nur Kategorien, die es wirklich gibt', () => {
    const wunsch = ersteWunsch('Ich möchte einkaufen und spazieren gehen und Post vorgelesen bekommen');
    const gueltig = new Set(SERVICE_CATEGORIES.map((c) => c.key));
    const entwurf = kategorienFuerEntwurf(wunsch);
    expect(entwurf.length).toBeGreaterThan(0);
    for (const key of entwurf) expect(gueltig.has(key)).toBe(true);
  });

  it('trägt höchstens drei Kategorien vor -- der Rest wäre keine Auswahl mehr', () => {
    const wunsch = ersteWunsch('Arzt Einkauf Spaziergang Kino Haushalt vorlesen');
    expect(kategorienFuerEntwurf(wunsch).length).toBeLessThanOrEqual(3);
  });

  it('übergibt bei einem Notfall nichts an das Formular', () => {
    expect(kategorienFuerEntwurf(ersteWunsch('Notruf'))).toEqual([]);
  });

  it('begrüßt mit dem Produktnamen und einer Frage', () => {
    const text = begruessung('Helpmate', false);
    expect(text).toContain('Helpmate');
    expect(text).toContain('Was kann ich für Sie tun?');
  });

  it('hält die Begrüßung in Leichter Sprache kurz', () => {
    const leicht = begruessung('Helpmate', true);
    const normal = begruessung('Helpmate', false);
    expect(leicht.length).toBeLessThan(normal.length);
  });
});
