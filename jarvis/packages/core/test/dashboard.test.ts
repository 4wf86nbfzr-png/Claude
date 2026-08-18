import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeJarvis, type TestJarvis } from './fakes.js';

/**
 * Die Kommandozentrale zeigt gemessene Werte, keine geschaetzten.
 * Diese Tests fuettern echte Vorgaenge ein und pruefen, dass die Zahlen
 * dazu passen -- inklusive der Faelle, in denen nichts passiert ist.
 */

let t: TestJarvis;
beforeEach(() => {
  t = makeJarvis({ env: { JARVIS_MAX_SENDS_PER_HOUR: '20', JARVIS_MIN_SEND_INTERVAL_SECONDS: '0' } });
});
afterEach(() => t.dispose());

async function sendeAn(name: string, adresse: string): Promise<void> {
  const { company } = t.jarvis.repos.companies.upsert({ name, website: `https://${adresse.split('@')[1]}` });
  t.jarvis.repos.companies.addEmailAddress({
    address: adresse,
    companyId: company.id,
    verification: 'VERIFIZIERT',
    foundOnUrl: `https://${adresse.split('@')[1]}/impressum`,
  });
  const entwurf = await t.jarvis.mail.createDraft({
    to: adresse,
    subject: `Angebot für ${name}`,
    body: 'Guten Tag,\n\nkurze Anfrage.\n\nMit freundlichen Grüßen',
    companyId: company.id,
  });
  if (!entwurf.ok) throw new Error(entwurf.error.message);
  const anfrage = t.jarvis.mail.requestSendApproval(entwurf.data.email.id);
  if (!anfrage.ok) throw new Error(anfrage.error.message);
  const r = await t.jarvis.approve(anfrage.data.approvalId);
  if (!r.ok) throw new Error(r.error.message);
}

describe('Kommandozentrale', () => {
  it('zeigt auf der leeren Datenbank überall Null, ohne zu raten', () => {
    const d = t.jarvis.dashboard();

    expect(d.wartetAufFreigabe).toBe(0);
    expect(d.kennzahlen.unternehmen).toBe(0);
    expect(d.kennzahlen.gesendetGesamt).toBe(0);
    expect(d.auslastung.stunde.verbraucht).toBe(0);
    expect(d.auslastung.stunde.grenze).toBe(20);
  });

  it('liefert immer 14 lückenlose Tage, damit die Kurve nicht lügt', () => {
    const d = t.jarvis.dashboard();

    expect(d.verlauf).toHaveLength(14);
    expect(d.verlauf.every((p) => p.anzahl === 0)).toBe(true);
    // Aufsteigend und ohne Lücke.
    const tage = d.verlauf.map((p) => p.tag);
    expect([...tage].sort()).toEqual(tage);
    expect(tage[13]).toBe(new Date().toISOString().slice(0, 10));
  });

  it('zählt gesendete Mails, Unternehmen und verifizierte Adressen mit', async () => {
    await sendeAn('Muster Bau GmbH', 'info@muster-bau.de');
    await sendeAn('Zweite Firma GmbH', 'info@zweite-firma.de');

    const d = t.jarvis.dashboard();
    expect(d.kennzahlen.unternehmen).toBe(2);
    expect(d.kennzahlen.mitVerifizierterAdresse).toBe(2);
    expect(d.kennzahlen.gesendetGesamt).toBe(2);
    expect(d.kennzahlen.gesendet7Tage).toBe(2);
    expect(d.auslastung.stunde.verbraucht).toBe(2);
    expect(d.verlauf[13]?.anzahl).toBe(2);
    expect(d.wartetAufFreigabe).toBe(0);
  });

  it('führt einen offenen Entwurf als wartend, nicht als gesendet', async () => {
    const { company } = t.jarvis.repos.companies.upsert({ name: 'Wartend GmbH', website: 'https://wartend.de' });
    t.jarvis.repos.companies.addEmailAddress({
      address: 'info@wartend.de',
      companyId: company.id,
      verification: 'VERIFIZIERT',
      foundOnUrl: 'https://wartend.de/impressum',
    });
    const entwurf = await t.jarvis.mail.createDraft({
      to: 'info@wartend.de',
      subject: 'Test',
      body: 'Text',
      companyId: company.id,
    });
    if (!entwurf.ok) throw new Error('Entwurf fehlgeschlagen');

    expect(t.jarvis.dashboard().kennzahlen.entwuerfe).toBe(1);

    t.jarvis.mail.requestSendApproval(entwurf.data.email.id);
    const d = t.jarvis.dashboard();
    expect(d.wartetAufFreigabe).toBe(1);
    expect(d.kennzahlen.entwuerfe).toBe(0); // steht jetzt auf "wartet auf Freigabe"
    expect(d.kennzahlen.gesendetGesamt).toBe(0);
  });

  it('meldet einen Fehlschlag als Fehlschlag', async () => {
    t.transport.scheitertMit = 'Mailbox unavailable (550)';
    await expect(sendeAn('Kaputt GmbH', 'info@kaputt-firma.de')).rejects.toThrow(/550/);

    const d = t.jarvis.dashboard();
    expect(d.kennzahlen.fehlgeschlagen).toBe(1);
    expect(d.kennzahlen.gesendetGesamt).toBe(0);
    expect(d.aktivitaet.some((a) => a.fehler)).toBe(true);
  });

  it('sagt bei der Bereitschaft, was fehlt', () => {
    const d = t.jarvis.dashboard();
    const namen = d.bereitschaft.map((b) => b.name);
    expect(namen).toEqual(['Sprachmodell', 'Websuche', 'Versandweg', 'Posteingang']);
    // Der Posteingang ist in der Testinstanz bewusst nicht eingerichtet.
    expect(d.bereitschaft.find((b) => b.name === 'Posteingang')?.bereit).toBe(false);
  });
});
