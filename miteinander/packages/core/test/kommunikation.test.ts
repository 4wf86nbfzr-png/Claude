import { describe, expect, it } from 'vitest';
import {
  GEGENUEBER_ANTWORTEN,
  KARTENGRUPPEN,
  KEINE_UEBERSETZUNG,
  VERSTAENDIGUNGSWEGE,
  baueAeusserung,
  karte,
} from '../src/content/kommunikation';

const alleKarten = KARTENGRUPPEN.flatMap((g) => g.karten);

describe('Karten für Menschen, die nicht sprechen können', () => {
  it('vergibt jeden Schlüssel nur einmal', () => {
    const keys = alleKarten.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gibt jeder Karte eine Beschriftung, einen gesprochenen Satz und ein Symbol', () => {
    for (const k of alleKarten) {
      expect(k.label.length, k.key).toBeGreaterThan(0);
      expect(k.gesprochen.length, k.key).toBeGreaterThan(0);
      expect(k.symbol.length, k.key).toBeGreaterThan(0);
    }
  });

  it('spricht in der Ich-Form oder als Bitte – nie über die Person hinweg', () => {
    for (const k of alleKarten) {
      expect(k.gesprochen, k.key).not.toMatch(/\b(er|sie) (möchte|braucht|will)\b/i);
    }
  });

  it('hält jeden gesprochenen Satz kurz genug zum Zuhören', () => {
    for (const k of alleKarten) {
      expect(k.gesprochen.length, k.key).toBeLessThanOrEqual(140);
    }
  });

  it('hat eine Gruppe für Grenzen – Nein sagen können ist keine Kür', () => {
    const grenzen = KARTENGRUPPEN.find((g) => g.key === 'grenzen');
    expect(grenzen).toBeDefined();
    const keys = grenzen!.karten.map((k) => k.key);
    expect(keys).toContain('nicht_anfassen');
    expect(keys).toContain('aufhoeren');
  });

  it('sagt auf Karte, dass jemand nicht sprechen kann und Gebärdensprache nutzt', () => {
    expect(karte('nicht_sprechen')?.gesprochen).toMatch(/nicht sprechen/i);
    expect(karte('gebaerdensprache')?.gesprochen).toMatch(/Gebärdensprache/);
  });

  it('kennt keine Karte, die es nicht gibt', () => {
    expect(karte('gibt-es-nicht')).toBeUndefined();
  });
});

describe('Äußerung bauen', () => {
  it('reiht gewählte Karten zu einem Satz', () => {
    expect(baueAeusserung(['ja', 'danke'])).toBe('Ja. Danke.');
  });

  it('hängt getippten Text hinten an und setzt den Punkt', () => {
    expect(baueAeusserung(['nicht_verstanden'], 'Bitte lauter')).toBe(
      'Ich habe das nicht verstanden. Bitte sagen Sie es noch einmal. Bitte lauter.',
    );
  });

  it('lässt ein Fragezeichen stehen', () => {
    expect(baueAeusserung([], 'Wie lange dauert das?')).toBe('Wie lange dauert das?');
  });

  it('funktioniert auch ganz ohne Karten', () => {
    expect(baueAeusserung([], 'Ich heiße Anna')).toBe('Ich heiße Anna.');
  });

  it('überspringt unbekannte Schlüssel, statt zu scheitern', () => {
    expect(baueAeusserung(['ja', 'gibt-es-nicht'])).toBe('Ja.');
  });

  it('gibt bei nichts auch nichts zurück – dann wird nicht gesprochen', () => {
    expect(baueAeusserung([], '   ')).toBe('');
  });
});

describe('Antworten des Gegenübers', () => {
  it('kommt ohne Tippen aus', () => {
    expect(GEGENUEBER_ANTWORTEN.length).toBeGreaterThanOrEqual(4);
    for (const k of GEGENUEBER_ANTWORTEN) {
      expect(k.label.length, k.key).toBeGreaterThan(0);
      expect(k.gesprochen.length, k.key).toBeGreaterThan(0);
    }
  });

  it('enthält eine Antwort, die Zeit einräumt', () => {
    expect(GEGENUEBER_ANTWORTEN.map((k) => k.key)).toContain('zeit_lassen');
  });
});

describe('Was die App über sich selbst sagt', () => {
  it('behauptet nicht, ein Gebärdensprach-Übersetzer zu sein', () => {
    expect(KEINE_UEBERSETZUNG).toMatch(/kein Gebärdensprach-Übersetzer/);
    expect(KEINE_UEBERSETZUNG).toMatch(/eigener Grammatik/);
  });

  it('nennt genau einen Weg, der heute schon läuft', () => {
    const fertig = VERSTAENDIGUNGSWEGE.filter((w) => w.stand === 'fertig');
    expect(fertig.map((w) => w.key)).toEqual(['karten']);
  });

  it('sagt bei jedem vorbereiteten Weg, was noch fehlt', () => {
    for (const w of VERSTAENDIGUNGSWEGE.filter((w) => w.stand === 'vorbereitet')) {
      expect(w.naechsterSchritt, w.key).toBeTruthy();
      expect(w.naechsterSchritt!.length, w.key).toBeGreaterThan(20);
    }
  });

  it('nennt Ferndolmetschen als den Weg zu vollwertiger Gebärdensprache', () => {
    const weg = VERSTAENDIGUNGSWEGE.find((w) => w.key === 'dolmetschen');
    expect(weg?.naechsterSchritt).toMatch(/Ferndolmetsch/);
  });

  it('sagt bei der Kamera-Erkennung offen, dass sie nicht trägt', () => {
    const weg = VERSTAENDIGUNGSWEGE.find((w) => w.key === 'gebaerden_erkennung');
    expect(weg?.stand).toBe('vorbereitet');
    expect(weg?.beschreibung).toMatch(/gibt es hier nicht/i);
  });
});
