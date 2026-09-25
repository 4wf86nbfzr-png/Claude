/**
 * Compliance-Zentrale (SecPlan 22, 23, 30).
 *
 * Diese Tests prüfen nicht, dass Zahlen stimmen – sie prüfen, dass das
 * System nicht behauptet, was es nicht wissen kann.
 */
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { complianceStand, gesamtsatz, type Punkt } from '@/lib/compliance/status';
import { sicherheitscheck } from '@/lib/compliance/sicherheitscheck';
import { PRUEF_STATUS, RECHTSGRUNDLAGE, TOM_STATUS } from '@/lib/status';

function punkt(teil: Partial<Punkt> = {}): Punkt {
  return { titel: 'X', href: '/x', gefuehrt: 1, geprueft: null, offen: [], stufe: 'erledigt', ...teil };
}

describe('Wortwahl', () => {
  it('nennt technisch umgesetzt und rechtlich geprüft als zwei verschiedene Stände', () => {
    expect(PRUEF_STATUS.TECHNISCH_UMGESETZT?.label).toBe('Technisch umgesetzt');
    expect(PRUEF_STATUS.RECHTLICH_GEPRUEFT?.label).toBe('Rechtlich geprüft');
    expect(PRUEF_STATUS.TECHNISCH_UMGESETZT).not.toEqual(PRUEF_STATUS.RECHTLICH_GEPRUEFT);
  });

  it('sagt bei einer nicht geprüften Rechtsgrundlage genau das', () => {
    expect(RECHTSGRUNDLAGE.OFFEN).toBe('noch nicht geprüft');
  });

  it('behauptet in keinem Statustext eine Konformität', () => {
    const alle = [
      ...Object.values(PRUEF_STATUS).map((s) => s.label),
      ...Object.values(TOM_STATUS).map((s) => s.label),
      ...Object.values(RECHTSGRUNDLAGE),
    ];
    for (const text of alle) {
      expect(text.toLowerCase(), text).not.toContain('konform');
      expect(text, text).not.toMatch(/\d+\s*%/);
    }
  });
});

describe('Gesamtsatz', () => {
  it('nennt keine Prozentzahl', () => {
    const satz = gesamtsatz([punkt({ stufe: 'offen' }), punkt({ stufe: 'in_arbeit' }), punkt()]);
    expect(satz).not.toMatch(/%/);
    expect(satz).not.toMatch(/konform/i);
  });

  it('macht auch im besten Fall klar, worüber er spricht', () => {
    const satz = gesamtsatz([punkt(), punkt()]);
    expect(satz).toContain('Stand der Einträge');
    expect(satz).not.toMatch(/konform/i);
  });

  it('zählt offene und begonnene Bereiche getrennt', () => {
    expect(gesamtsatz([punkt({ stufe: 'offen' })])).toContain('1 Bereich ist offen');
    expect(gesamtsatz([punkt({ stufe: 'offen' }), punkt({ stufe: 'offen' })])).toContain('2 Bereiche sind offen');
    expect(gesamtsatz([punkt({ stufe: 'in_arbeit' })])).toContain('1 in Arbeit');
  });
});

describe('Stand je Bereich (gegen die Datenbank)', () => {
  it('meldet einen Bereich ohne geprüfte Einträge nie als erledigt', async () => {
    const punkte = await complianceStand();
    for (const p of punkte) {
      if (p.geprueftLabel !== 'rechtlich geprüft') continue;
      if (p.geprueft !== null && p.gefuehrt > 0 && p.geprueft < p.gefuehrt) {
        expect(p.stufe, p.titel).not.toBe('erledigt');
        expect(p.offen.join(' '), p.titel).toMatch(/rechtlich geprüft/);
      }
    }
  });

  it('beschriftet die zweite Zahl, statt überall „geprüft" zu behaupten', async () => {
    const punkte = await complianceStand();
    for (const p of punkte) {
      if (p.geprueft === null) continue;
      expect(p.geprueftLabel, p.titel).toBeDefined();
    }
    // Die TOM zählen Umsetzung, nicht rechtliche Prüfung.
    const tom = punkte.find((p) => p.titel.includes('Art. 32'));
    expect(tom?.geprueftLabel).toBe('umgesetzt oder geregelt');
  });

  it('liefert für jeden Bereich ein erreichbares Ziel', async () => {
    const punkte = await complianceStand();
    expect(punkte.length).toBeGreaterThan(0);
    for (const p of punkte) expect(p.href.startsWith('/')).toBe(true);
  });

  it('bewertet die Meldepflicht eines Vorfalls nicht selbst', async () => {
    // Das Datenmodell lässt reportable ausdrücklich offen. Ein Vorfall,
    // den niemand bewertet hat, bleibt unbewertet – auch nach einem
    // Durchlauf des Standes.
    const vorher = await db.dataBreach.count({ where: { reportable: null } });
    await complianceStand();
    expect(await db.dataBreach.count({ where: { reportable: null } })).toBe(vorher);
  });

  it('erfindet keine Rechtsgrundlage', async () => {
    const vorher = await db.processingActivity.count({ where: { lawfulBasis: 'OFFEN' } });
    await complianceStand();
    expect(await db.processingActivity.count({ where: { lawfulBasis: 'OFFEN' } })).toBe(vorher);
  });
});

describe('Sicherheitscheck', () => {
  it('nennt zu jeder Prüfung, warum sie läuft', async () => {
    const pruefungen = await sicherheitscheck();
    expect(pruefungen.length).toBeGreaterThanOrEqual(10);
    for (const p of pruefungen) {
      expect(p.frage.length, p.id).toBeGreaterThan(10);
      expect(p.warum.length, p.id).toBeGreaterThan(20);
    }
  });

  it('gibt Befunde mit Namen aus, nicht nur eine Anzahl', async () => {
    const pruefungen = await sicherheitscheck();
    for (const p of pruefungen) {
      for (const befund of p.befunde) {
        expect(befund.text.length, `${p.id}: ${befund.text}`).toBeGreaterThan(10);
      }
    }
  });

  it('findet privilegierte Zugänge ohne zweiten Faktor', async () => {
    // Im Seed hat niemand einen zweiten Faktor – die Prüfung muss anschlagen.
    const pruefungen = await sicherheitscheck();
    const mfa = pruefungen.find((p) => p.id === 'mfa');
    expect(mfa).toBeDefined();
    expect(mfa!.gewicht).toBe('hoch');
    expect(mfa!.befunde.length).toBeGreaterThan(0);
  });

  it('bewertet nicht, sondern zeigt', async () => {
    const pruefungen = await sicherheitscheck();
    for (const p of pruefungen) {
      expect(p.frage.toLowerCase(), p.id).not.toContain('konform');
      expect(p.warum, p.id).not.toMatch(/\d+\s*% /);
    }
  });
});
