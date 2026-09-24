import { describe, expect, it } from 'vitest';
import { parseRequestEmail, stripQuotes, stripSignature } from '@/lib/email/parser';

const reference = new Date('2026-09-24T00:00:00Z');

describe('Freitext-Anfrage (Spec 18)', () => {
  const body = `Hallo,

für den 15.10. benötigen wir für eine Veranstaltung in Hamburg 12 Sicherheitskräfte von 17 bis 01 Uhr.
Treffpunkt ist 16:30 Uhr.

Viele Grüße
Thomas Brand`;

  const parsed = parseRequestEmail({
    subject: 'Anfrage: Firmenjubiläum',
    body,
    fromName: 'Thomas Brand',
    fromEmail: 'brand@nordlicht-events.de',
    referenceDate: reference,
  });

  it('erkennt die Anfrage als Personalanfrage', () => {
    expect(parsed.isRequest).toBe(true);
  });

  it('liest Datum, Zeiten und Treffzeit', () => {
    expect(parsed.eventDate.value).toBe('2026-10-15');
    expect(parsed.startTime.value).toBe('17:00');
    expect(parsed.endTime.value).toBe('01:00');
    expect(parsed.meetingTime.value).toBe('16:30');
  });

  it('liest Anzahl, Leistungsart und Ort', () => {
    expect(parsed.employeesNeeded.value).toBe(12);
    expect(parsed.serviceType.value).toBe('SICHERHEIT');
    expect(parsed.location.value).toBe('Hamburg');
  });

  it('liest Kontaktdaten', () => {
    expect(parsed.contactPerson.value).toBe('Thomas Brand');
    expect(parsed.email.value).toBe('brand@nordlicht-events.de');
    expect(parsed.company.value).toBe('Nordlicht-events');
  });

  it('meldet keine fehlenden Pflichtfelder', () => {
    expect(parsed.missingFields).toEqual([]);
    expect(parsed.confidence).toBeGreaterThan(0.6);
  });
});

describe('Unvollstaendige Anfrage', () => {
  const parsed = parseRequestEmail({
    subject: 'Personal gesucht',
    body: 'Moin, wir brauchen Personal für unser Event. Melden Sie sich bitte.',
    fromEmail: 'kontakt@gmx.de',
    referenceDate: reference,
  });

  it('laesst unsichere Felder leer statt zu raten', () => {
    expect(parsed.eventDate.value).toBeNull();
    expect(parsed.employeesNeeded.value).toBeNull();
    expect(parsed.startTime.value).toBeNull();
  });

  it('meldet die fehlenden Angaben an die Disposition', () => {
    expect(parsed.missingFields).toContain('Datum');
    expect(parsed.missingFields).toContain('Anzahl Mitarbeiter');
    expect(parsed.confidence).toBeLessThan(0.5);
  });

  it('erkennt keine Firma bei Freemail-Adressen', () => {
    expect(parsed.company.value).toBeNull();
  });
});

describe('Weitere Schreibweisen', () => {
  it('liest strukturierte Formularmails', () => {
    const parsed = parseRequestEmail({
      subject: 'Kontaktformular hermserviceteam.com',
      body: [
        'Firma: Hafenlicht GmbH',
        'Ansprechpartner: Marie Ahrens',
        'Telefon: 040 123456',
        'Veranstaltungsort: Elbphilharmonie, 20457 Hamburg',
        'Datum: 05.12.2026',
        'Zeit: von 18:00 bis 23:30',
        'Benötigte Mitarbeiter: 8 Servicekräfte',
      ].join('\n'),
      fromEmail: 'm.ahrens@hafenlicht.de',
      referenceDate: reference,
    });
    expect(parsed.company.value).toBe('Hafenlicht GmbH');
    expect(parsed.eventDate.value).toBe('2026-12-05');
    expect(parsed.startTime.value).toBe('18:00');
    expect(parsed.endTime.value).toBe('23:30');
    expect(parsed.employeesNeeded.value).toBe(8);
    expect(parsed.serviceType.value).toBe('GASTRO');
    expect(parsed.location.value).toBe('Elbphilharmonie, 20457 Hamburg');
    expect(parsed.phone.value).toBe('040 123456');
  });

  it('liest ausgeschriebene Zahlen', () => {
    const parsed = parseRequestEmail({
      body: 'Wir benötigen am 20.11.2026 acht Hostessen von 10:00 bis 18:00 in Bremen.',
      referenceDate: reference,
    });
    expect(parsed.employeesNeeded.value).toBe(8);
    expect(parsed.serviceType.value).toBe('PROMOTION');
  });

  it('ergaenzt ein fehlendes Jahr sinnvoll', () => {
    const parsed = parseRequestEmail({ body: 'Am 02.01. brauchen wir 4 Ordner.', referenceDate: reference });
    expect(parsed.eventDate.value).toBe('2027-01-02');
  });
});

describe('Textaufbereitung', () => {
  it('schneidet Grussformel und Signatur ab', () => {
    const cut = stripSignature('Text mit Inhalt.\n\nViele Grüße\nMax Mustermann\nTel. 040 1234');
    expect(cut).toContain('Text mit Inhalt.');
    expect(cut).not.toContain('Max Mustermann');
  });

  it('entfernt zitierte Vorgaengermails', () => {
    const cut = stripQuotes('Neue Frage.\n> alte Mail\nAm 01.01.2026 schrieb Max:\n alter Text');
    expect(cut).toContain('Neue Frage.');
    expect(cut).not.toContain('alter Text');
  });
});
