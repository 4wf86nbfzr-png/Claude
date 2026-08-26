import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALLGEMEINE_FRAGEN,
  BEGLEITER,
  alleBegleiterSchritte,
  begleiterSchritt,
  fragenFuer,
  vorleseText,
} from '../src/content/begleiter';
import { REQUIRED_DGS_KEYS } from '../src/content/dgs-skripte';
import {
  NIE_IM_KALENDER,
  baueEinzelEintrag,
  baueKalenderFeed,
  baueKalenderVerbindung,
  enthaeltPersonenbezug,
  eintragsTitel,
  falteZeile,
  icsText,
  icsZeit,
} from '../src/kalender/ics';
import { createMemoryContext } from '../src/data/memory/memory-context';
import { fixedClock, type DataContext } from '../src/data/repositories';
import { SupportService, createCounterIds } from '../src/services/support-service';
import { createDraft } from '../src/requests/wizard';
import { demoSeed } from '../src/seed/demo-data';
import type { Booking } from '../src/domain/types';

const NOW = '2026-03-02T09:00:00.000Z';

describe('Die Begleitung', () => {
  it('sagt selbst, dass sie kein Mensch ist', () => {
    expect(BEGLEITER.selbstauskunft).toMatch(/kein Mensch/i);
  });

  it('behauptet nicht, selbst zu gebärden', () => {
    expect(BEGLEITER.gebaerdenHinweis).toMatch(/gebärde nicht selbst/i);
    expect(BEGLEITER.gebaerdenHinweis).toMatch(/gehörlosen Menschen aufgenommen/i);
  });

  it('erklärt auf jedem Bildschirm Ort, Möglichkeiten und Folge', () => {
    for (const schritt of alleBegleiterSchritte()) {
      expect(schritt.woBinIch.length, schritt.key).toBeGreaterThan(15);
      expect(schritt.woBinIchLeicht.length, schritt.key).toBeGreaterThan(10);
      expect(schritt.wasKannIchTun.length, schritt.key).toBeGreaterThan(0);
      expect(schritt.wasPassiertDann.length, schritt.key).toBeGreaterThan(15);
    }
  });

  it('verweist auf einen Ablauf, für den es Gebärdensprache gibt', () => {
    for (const schritt of alleBegleiterSchritte()) {
      expect(REQUIRED_DGS_KEYS, schritt.key).toContain(schritt.dgsKey);
    }
  });

  it('beantwortet überall die Fragen, die immer kommen', () => {
    const fragen = fragenFuer('vorschlaege').map((f) => f.frage);
    for (const allgemein of ALLGEMEINE_FRAGEN) {
      expect(fragen).toContain(allgemein.frage);
    }
  });

  it('gibt zu jeder Frage eine Antwort in beiden Sprachformen', () => {
    for (const schritt of alleBegleiterSchritte()) {
      for (const frage of fragenFuer(schritt.key)) {
        expect(frage.antwort.length, frage.frage).toBeGreaterThan(20);
        expect(frage.antwortLeicht.length, frage.frage).toBeGreaterThan(10);
      }
    }
  });

  it('verweist beim Notfall auf 112 statt auf sich selbst', () => {
    const notfall = ALLGEMEINE_FRAGEN.find((f) => f.frage.includes('sofort Hilfe'));
    expect(notfall?.antwort).toContain('112');
    expect(notfall?.antwort).toMatch(/kein Notruf/i);
  });

  it('liest den Bildschirm in sinnvoller Reihenfolge vor', () => {
    const schritt = begleiterSchritt('anfrage.summary')!;
    const text = vorleseText(schritt, false);
    expect(text.indexOf(BEGLEITER.name)).toBe(0);
    expect(text.indexOf('Das können Sie hier tun')).toBeLessThan(text.indexOf('Was danach passiert'));
  });

  it('nutzt in Leichter Sprache die kurze Fassung', () => {
    const schritt = begleiterSchritt('start')!;
    expect(vorleseText(schritt, true)).toContain(schritt.woBinIchLeicht.replace(/\n/g, ' '));
  });
});

describe('Kalendereinträge', () => {
  function booking(overrides: Partial<Booking> = {}): Booking {
    return {
      id: 'book_1',
      requestId: 'req_1',
      seekerId: 'u_seeker_1',
      providerId: 'u_provider_1',
      status: 'confirmed',
      startsAt: '2026-09-04T10:00:00.000Z',
      durationMinutes: 90,
      categoryKeys: ['begleitung_termine'],
      meetingPointDescription: 'Vor dem Eingang des Bürgeramts, Hamburg-Mitte',
      preciseAddressReleased: true,
      priceCents: 4200,
      volunteer: false,
      cancellationPolicy: 'Bis 24 Stunden vorher kostenlos.',
      confirmedBySeekerAt: NOW,
      confirmedByProviderAt: NOW,
      createdAt: NOW,
      ...overrides,
    };
  }

  it('schreibt Zeitstempel im geforderten Format', () => {
    expect(icsZeit('2026-09-04T10:00:00.000Z')).toBe('20260904T100000Z');
    expect(() => icsZeit('kaputt')).toThrow();
  });

  it('maskiert Sonderzeichen, die den Eintrag sonst zerreißen', () => {
    expect(icsText('Treffpunkt, Eingang; Seite A')).toBe('Treffpunkt\\, Eingang\\; Seite A');
    expect(icsText('Zeile eins\nZeile zwei')).toBe('Zeile eins\\nZeile zwei');
  });

  it('bricht lange Zeilen um, ohne Umlaute zu zerschneiden', () => {
    const lang = 'SUMMARY:' + 'Begleitung zu Terminen für Frau Müller in Hamburg '.repeat(4);
    const gefaltet = falteZeile(lang);
    expect(gefaltet).toContain('\r\n ');
    expect(gefaltet.split('\r\n ').join('')).toBe(lang);
    for (const zeile of gefaltet.split('\r\n')) {
      expect(new TextEncoder().encode(zeile).length).toBeLessThanOrEqual(76);
    }
  });

  it('erzeugt einen vollständigen, gültig aufgebauten Eintrag', () => {
    const ics = baueEinzelEintrag(booking(), { jetzt: NOW });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20260904T100000Z');
    expect(ics).toContain('DTEND:20260904T113000Z');
    expect(ics).toContain('UID:book_1@');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('BEGIN:VALARM');
  });

  it('nennt die Tätigkeit als Titel, nicht die Person', () => {
    expect(eintragsTitel(booking())).toBe('Begleitung zu Terminen');
  });

  it('enthält keine personenbezogenen Angaben', () => {
    const ics = baueEinzelEintrag(booking(), { jetzt: NOW });
    const verboten = [
      'Frau Kessler (Demo)',
      'Beispielweg',
      '+49 40 000000 (Demo)',
      'Rollator',
      'u_seeker_1',
    ];
    expect(enthaeltPersonenbezug(ics, verboten)).toEqual([]);
    expect(NIE_IM_KALENDER.length).toBeGreaterThan(3);
  });

  it('kennzeichnet abgesagte Termine als abgesagt', () => {
    const ics = baueEinzelEintrag(booking({ status: 'cancelled_by_seeker' }), { jetzt: NOW });
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it('lässt die Erinnerung abschalten', () => {
    const ics = baueEinzelEintrag(booking(), { jetzt: NOW, erinnerungMinuten: 0 });
    expect(ics).not.toContain('BEGIN:VALARM');
  });

  it('bündelt mehrere Termine zu einem Kalender', () => {
    const ics = baueKalenderFeed([booking(), booking({ id: 'book_2' })], { jetzt: NOW });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(ics).toContain('UID:book_2@');
  });

  it('erzeugt eine abonnierbare Adresse und warnt vor der Weitergabe', () => {
    const verbindung = baueKalenderVerbindung('https://app.example.org/', 'geheim123');
    expect(verbindung.webcalUrl).toBe('webcal://app.example.org/kalender/geheim123.ics');
    expect(verbindung.httpsUrl).toBe('https://app.example.org/kalender/geheim123.ics');
    expect(verbindung.hinweis).toMatch(/nicht weiter/i);
    expect(verbindung.hinweis).toMatch(/neuen Link/i);
  });
});

describe('Benachrichtigung bei einer neuen Anfrage', () => {
  let data: DataContext;
  let service: SupportService;

  beforeEach(() => {
    data = createMemoryContext(demoSeed);
    service = new SupportService(data, fixedClock(NOW), createCounterIds());
  });

  const entwurf = (id: string, seekerId: string, kategorien: string[], overrides = {}) => ({
    ...createDraft(id, seekerId, NOW),
    categoryKeys: kategorien,
    startsAt: '2026-03-04T10:00:00.000Z',
    durationMinutes: 90,
    region: { postalPrefix: '221', city: 'Hamburg', approxLat: 53.55, approxLon: 9.99 },
    importantToMe: ['Rollator'],
    ...overrides,
  });

  it('erreicht passende Anbietende, sobald die Anfrage offen ist', async () => {
    await service.submitRequest(entwurf('req_neu', 'u_seeker_1', ['begleitung_termine']));
    const meike = await service.unreadNotifications('u_provider_1');
    expect(meike.some((n) => n.title.includes('neue Anfrage'))).toBe(true);
    // Der Inhalt der Anfrage steht nie in der Vorschau.
    expect(meike.every((n) => !n.body.includes('Rollator'))).toBe(true);
  });

  it('erreicht niemanden, der die Qualifikation nicht hat', async () => {
    await service.submitRequest(
      entwurf('req_pflege', 'u_seeker_1', ['pflegerische_unterstuetzung'], { importantToMe: [] }),
    );
    expect((await service.unreadNotifications('u_provider_3')).length).toBe(0);
    expect((await service.unreadNotifications('u_provider_1')).length).toBeGreaterThan(0);
  });

  it('lässt sich als gelesen markieren', async () => {
    await service.submitRequest(entwurf('req_x', 'u_seeker_1', ['begleitung_termine']));
    const offen = await service.unreadNotifications('u_provider_1');
    expect(offen.length).toBeGreaterThan(0);
    await service.markNotificationRead('u_provider_1', offen[0]!.id);
    expect((await service.unreadNotifications('u_provider_1')).length).toBe(offen.length - 1);
  });
});
