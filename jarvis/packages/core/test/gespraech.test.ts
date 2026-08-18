import { afterEach, describe, expect, it } from 'vitest';
import { FakeLlm, makeJarvis, type TestJarvis } from './fakes.js';
import { gespraechsPrompt } from '../src/agents/gespraech.js';
import { ok } from '../src/util/result.js';
import type { CalendarEvent, CalendarSource } from '../src/calendar/index.js';

/**
 * Der Gesprächsmodus.
 *
 * Zwei Dinge müssen stimmen: JARVIS eröffnet nur, wenn es wirklich etwas
 * gibt (kein erfundener Small Talk), und im Gespräch gelten Sprechregeln
 * statt Schreibregeln.
 */

let t: TestJarvis;
afterEach(() => t?.dispose());

function kalenderMit(termine: CalendarEvent[]): CalendarSource {
  return {
    id: 'test',
    label: 'Testkalender',
    isConfigured: () => true,
    events: async () => ok(termine),
  };
}

describe('Wann JARVIS von sich aus etwas sagt', () => {
  it('sagt bei leerem Zustand nichts Erfundenes', async () => {
    t = makeJarvis();
    const anlaesse = await t.jarvis.anlaesse();
    expect(anlaesse).toHaveLength(0);

    // Die Begrüßung bleibt dann bewusst minimal.
    const gruss = await t.jarvis.begruessung(new Date('2026-08-18T14:00:00'));
    expect(gruss.length).toBeLessThan(30);
    expect(gruss).not.toMatch(/wochenende|wetter|wie geht/i);
  });

  it('meldet eine offene Freigabe zuerst — das ist das Dringendste', async () => {
    t = makeJarvis();
    const { company } = t.jarvis.repos.companies.upsert({ name: 'Nordbau GmbH', website: 'https://nordbau.de' });
    t.jarvis.repos.companies.addEmailAddress({
      address: 'info@nordbau.de',
      companyId: company.id,
      verification: 'VERIFIZIERT',
      foundOnUrl: 'https://nordbau.de/impressum',
    });
    const entwurf = await t.jarvis.mail.createDraft({
      to: 'info@nordbau.de',
      subject: 'Baustellenbewachung',
      body: 'Guten Tag',
      companyId: company.id,
    });
    if (!entwurf.ok) throw new Error('Entwurf fehlgeschlagen');
    t.jarvis.mail.requestSendApproval(entwurf.data.email.id);

    const anlaesse = await t.jarvis.anlaesse();
    expect(anlaesse[0]?.art).toBe('freigabe');
    expect(anlaesse[0]?.text).toContain('Freigabe');
    expect(await t.jarvis.begruessung()).toContain('Freigabe');
  });

  it('nennt einen fehlgeschlagenen Versand', async () => {
    t = makeJarvis();
    const entwurf = await t.jarvis.mail.createDraft({ to: 'x@y.de', subject: 'T', body: 'B' });
    if (!entwurf.ok) throw new Error('Entwurf fehlgeschlagen');
    t.jarvis.repos.emails.markFailed(entwurf.data.email.id, 'Mailbox unavailable (550)');

    const anlaesse = await t.jarvis.anlaesse();
    expect(anlaesse.some((a) => a.art === 'fehler')).toBe(true);
  });

  it('nennt den nächsten Termin des Tages', async () => {
    const heute = new Date('2026-08-18T09:00:00');
    t = makeJarvis({
      calendar: kalenderMit([
        {
          uid: '1',
          summary: 'Ortstermin HafenCity',
          start: '2026-08-18T14:00:00.000Z',
          end: null,
          allDay: false,
          location: null,
          description: null,
          quelle: 'test',
        },
      ]),
    });

    const anlaesse = await t.jarvis.anlaesse(heute);
    const termin = anlaesse.find((a) => a.art === 'termin');
    expect(termin?.text).toContain('Ortstermin HafenCity');
  });

  it('ordnet nach Dringlichkeit: Freigabe vor Termin', async () => {
    t = makeJarvis({
      calendar: kalenderMit([
        {
          uid: '1',
          summary: 'Irgendein Termin',
          start: new Date(Date.now() + 3_600_000).toISOString(),
          end: null,
          allDay: false,
          location: null,
          description: null,
          quelle: 'test',
        },
      ]),
    });
    const e = await t.jarvis.mail.createDraft({ to: 'a@b.de', subject: 'T', body: 'B' });
    if (!e.ok) throw new Error('Entwurf fehlgeschlagen');
    t.jarvis.mail.requestSendApproval(e.data.email.id);

    const anlaesse = await t.jarvis.anlaesse();
    expect(anlaesse[0]?.art).toBe('freigabe');
    expect(anlaesse.map((a) => a.art)).toContain('termin');
  });
});

describe('Sprechregeln im Gesprächsmodus', () => {
  it('verbietet ausdrücklich, was gesprochen nicht funktioniert', () => {
    t = makeJarvis();
    const prompt = gespraechsPrompt(t.jarvis.context, null);

    expect(prompt).toContain('Ein bis drei Sätze');
    expect(prompt).toContain('Keine Kennungen');
    expect(prompt).toContain('Du plauderst nicht ohne Anlass');
    // Die unverrückbaren Regeln gelten weiter.
    expect(prompt).toContain('Du erfindest keine Fakten');
    expect(prompt).toContain('Du gibst dir niemals selbst frei');
  });

  it('spricht mit Namen an, wenn einer gemerkt wurde', () => {
    t = makeJarvis();
    expect(gespraechsPrompt(t.jarvis.context, 'Moritz')).toContain('Moritz');
    expect(gespraechsPrompt(t.jarvis.context, null)).not.toContain('Dein Gegenüber heißt');
  });

  it('nutzt im Gesprächsmodus den anderen Prompt, aber dieselben Werkzeuge', async () => {
    const llm = new FakeLlm([{ text: 'Alles ruhig.' }, { text: 'Alles ruhig.' }]);
    t = makeJarvis({ llm });

    await t.jarvis.ask('Was steht an?', { gespraechsmodus: true });
    const gespraech = llm.requests[0]!;
    expect(gespraech.system).toContain('DU SPRICHST GERADE');

    await t.jarvis.ask('Was steht an?');
    const geschrieben = llm.requests[1]!;
    expect(geschrieben.system).not.toContain('DU SPRICHST GERADE');

    // Die Werkzeugliste ist in beiden Fällen dieselbe.
    expect(gespraech.tools?.map((w) => w.name).sort()).toEqual(geschrieben.tools?.map((w) => w.name).sort());
  });
});
