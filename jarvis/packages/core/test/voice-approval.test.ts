import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeLlm, makeJarvis, type TestJarvis } from './fakes.js';

/**
 * Gesprochene Freigaben.
 *
 * Der heikle Punkt: ein beilaeufiges "ja" darf keine Mail ausloesen, ein
 * klares "senden" schon. Und wenn mehrere Freigaben offen sind, wird
 * nachgefragt statt geraten.
 */

let t: TestJarvis;
beforeEach(() => {
  t = makeJarvis({ llm: new FakeLlm([{ text: 'Verstanden.' }, { text: 'Verstanden.' }, { text: 'Verstanden.' }]) });
});
afterEach(() => t?.dispose());

async function entwurfMitFreigabe(name: string, adresse: string): Promise<string> {
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
    body: 'Sehr geehrte Damen und Herren,\n\nkurzer Hinweis.\n\nMit freundlichen Grüßen',
    companyId: company.id,
  });
  if (!entwurf.ok) throw new Error(entwurf.error.message);
  const anfrage = t.jarvis.mail.requestSendApproval(entwurf.data.email.id);
  if (!anfrage.ok) throw new Error(anfrage.error.message);
  return anfrage.data.approvalId;
}

describe('Deutung von Äußerungen', () => {
  it('erkennt klare Zustimmungen', () => {
    for (const satz of ['Senden', 'freigeben', 'Mail abschicken', 'Ja, genau so senden', 'Jetzt senden']) {
      const d = t.jarvis.interpretApprovalUtterance(satz);
      expect(d.art, satz).toBe('zustimmung');
      expect(d.staerke, satz).toBe('stark');
    }
  });

  it('erkennt Ablehnungen', () => {
    for (const satz of ['Abbrechen', 'Nicht senden', 'Doch nicht', 'Nein']) {
      expect(t.jarvis.interpretApprovalUtterance(satz).art, satz).toBe('ablehnung');
    }
  });

  it('stuft ein bloßes „ja" als schwach ein', () => {
    const d = t.jarvis.interpretApprovalUtterance('ja');
    expect(d.art).toBe('zustimmung');
    expect(d.staerke).toBe('schwach');
  });

  it('liest die Nummer aus „Nummer 4 freigeben"', () => {
    const d = t.jarvis.interpretApprovalUtterance('Nummer 4 freigeben');
    expect(d.art).toBe('zustimmung');
    expect(d.nummer).toBe(4);
  });

  it('deutet normale Sätze nicht als Freigabe', () => {
    for (const satz of ['Such mir 15 Bauunternehmen in Hamburg', 'Wie ist der Stand?', 'Mach den Text kürzer']) {
      expect(t.jarvis.interpretApprovalUtterance(satz).art, satz).toBe('keine');
    }
  });
});

describe('Freigabe per Sprache', () => {
  it('sendet bei einem klaren „senden"', async () => {
    await entwurfMitFreigabe('Muster Bau GmbH', 'info@muster-bau.de');

    const r = await t.jarvis.ask('Senden');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.antwort).toContain('versendet');
    expect(t.transport.gesendet).toHaveLength(1);
  });

  it('sendet bei einem bloßen „ja" nicht, sondern fragt nach', async () => {
    await entwurfMitFreigabe('Muster Bau GmbH', 'info@muster-bau.de');

    const r = await t.jarvis.ask('ja');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.antwort).toContain('ausdrücklich');
    expect(t.transport.gesendet).toHaveLength(0);
  });

  it('fragt nach, wenn mehrere Freigaben offen sind', async () => {
    await entwurfMitFreigabe('Erste GmbH', 'info@erste-firma.de');
    await entwurfMitFreigabe('Zweite GmbH', 'info@zweite-firma.de');

    const r = await t.jarvis.ask('Senden');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.antwort).toContain('welche meinen Sie');
    expect(r.data.antwort).toContain('1.');
    expect(t.transport.gesendet).toHaveLength(0);
  });

  it('trifft mit einer Nummer die richtige Mail', async () => {
    await entwurfMitFreigabe('Erste GmbH', 'info@erste-firma.de');
    await entwurfMitFreigabe('Zweite GmbH', 'info@zweite-firma.de');

    const r = await t.jarvis.ask('Nummer 2 freigeben');
    expect(r.ok).toBe(true);
    expect(t.transport.gesendet).toHaveLength(1);
    expect(t.transport.gesendet[0]?.to[0]?.address).toBe('info@zweite-firma.de');
  });

  it('bricht bei „abbrechen" ab und behält den Entwurf', async () => {
    const approvalId = await entwurfMitFreigabe('Muster Bau GmbH', 'info@muster-bau.de');

    const r = await t.jarvis.ask('Abbrechen');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.antwort).toContain('nicht ausgeführt');
    expect(t.transport.gesendet).toHaveLength(0);
    expect(t.jarvis.approvals.get(approvalId)?.status).toBe('abgelehnt');
  });

  it('reicht eine Äußerung ohne Freigabebezug ans Modell durch', async () => {
    await entwurfMitFreigabe('Muster Bau GmbH', 'info@muster-bau.de');

    const r = await t.jarvis.ask('Mach den zweiten Absatz kürzer');
    expect(r.ok).toBe(true);
    expect(t.transport.gesendet).toHaveLength(0);
    // Das Modell wurde befragt, die Freigabe blieb offen.
    expect(t.llm.requests.length).toBeGreaterThan(0);
    expect(t.jarvis.pendingApprovals()).toHaveLength(1);
  });
});
