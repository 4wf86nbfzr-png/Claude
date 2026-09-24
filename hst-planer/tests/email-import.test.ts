/**
 * E-Mail-Import (Spec 17): aus einer eingegangenen Nachricht wird eine
 * Anfrage zur Pruefung – niemals eine Buchung.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, testBenutzer, TEST_USER } from './hilfen/db';
import { anfrageAusEmail } from '@/lib/domain/requests';
import { parseRequestEmail } from '@/lib/email/parser';

const MARKE = `MAIL-${Date.now()}`;
const mailIds: string[] = [];
const anfrageIds: string[] = [];

beforeAll(async () => { await testBenutzer(); });

afterAll(async () => {
  await db.request.deleteMany({ where: { id: { in: anfrageIds } } });
  await db.emailMessage.deleteMany({ where: { id: { in: mailIds } } });
  await db.notification.deleteMany({ where: { title: { contains: 'Personalanfrage' } } });
  await db.auditLog.deleteMany({ where: { userId: TEST_USER.id } });
  await db.$disconnect();
});

async function mailAnlegen(betreff: string, text: string, von = 'brand@nordlicht-test.de') {
  const mail = await db.emailMessage.create({
    data: {
      messageId: `<${MARKE}-${Math.random()}@test>`,
      fromName: 'Thomas Brand', fromEmail: von,
      toEmail: 'info@hermserviceteam.com',
      subject: betreff, receivedAt: new Date(), textBody: text, status: 'NEU',
    },
  });
  mailIds.push(mail.id);
  return mail;
}

describe('Freitext-Mail wird zur Anfrage', () => {
  it('legt eine Anfrage mit gelesenen Feldern an', async () => {
    const mail = await mailAnlegen('Anfrage Firmenjubilaeum', [
      'Hallo,', '',
      'für den 15.10.2031 benötigen wir für eine Veranstaltung in Hamburg',
      '12 Sicherheitskräfte von 17 bis 01 Uhr.',
      'Treffpunkt ist 16:30 Uhr.', '',
      'Viele Grüße', 'Thomas Brand',
    ].join('\n'));

    const anfrage = await anfrageAusEmail(mail.id);
    expect(anfrage).not.toBeNull();
    anfrageIds.push(anfrage!.id);

    expect(anfrage!.reference).toMatch(/^AN-\d{4}-\d{4}$/);
    expect(anfrage!.channel).toBe('EMAIL');
    expect(anfrage!.eventDate?.toISOString().slice(0, 10)).toBe('2031-10-15');
    expect(anfrage!.startTime).toBe('17:00');
    expect(anfrage!.endTime).toBe('01:00');
    expect(anfrage!.meetingTime).toBe('16:30');
    expect(anfrage!.employeesNeeded).toBe(12);
    expect(anfrage!.serviceType).toBe('SICHERHEIT');
    expect(anfrage!.location).toBe('Hamburg');
  });

  it('markiert die Anfrage als pruefungsbeduerftig – nie als Buchung', async () => {
    const anfrage = await db.request.findUniqueOrThrow({ where: { id: anfrageIds[0]! } });
    expect(anfrage.status).toBe('NEU');
    expect(anfrage.needsReview).toBe(true);
    expect(anfrage.eventId).toBeNull();
  });

  it('setzt die E-Mail auf verarbeitet und benachrichtigt die Disposition', async () => {
    const mail = await db.emailMessage.findUniqueOrThrow({ where: { id: mailIds[0]! } });
    expect(mail.status).toBe('VERARBEITET');
    expect(mail.isRequest).toBe(true);

    const meldung = await db.notification.findFirst({
      where: { kind: 'NEUE_ANFRAGE', dedupeKey: `anfrage:${anfrageIds[0]}` },
    });
    expect(meldung?.title).toContain('Pruefung erforderlich');
  });

  it('erzeugt keine zweite Anfrage aus derselben Mail', async () => {
    const nochmal = await anfrageAusEmail(mailIds[0]!);
    expect(nochmal).toBeNull();
    expect(await db.request.count({ where: { emailMessageId: mailIds[0] } })).toBe(1);
  });
});

describe('Unvollstaendige Mail', () => {
  it('meldet die fehlenden Angaben statt zu raten', async () => {
    const mail = await mailAnlegen('Personal gesucht', 'Moin, wir brauchen Personal für unser Event. Bitte um Rückruf.', 'kontakt@gmx.de');
    const anfrage = await anfrageAusEmail(mail.id);
    anfrageIds.push(anfrage!.id);

    expect(anfrage!.eventDate).toBeNull();
    expect(anfrage!.employeesNeeded).toBeNull();
    expect(anfrage!.missingFields).toContain('Datum');
    expect(anfrage!.missingFields).toContain('Anzahl Mitarbeiter');
    expect(anfrage!.confidence).toBeLessThan(0.5);
  });
});

describe('Bekannter Kunde', () => {
  it('wird ueber die E-Mail-Domain erkannt', async () => {
    const kunde = await db.customer.create({
      data: { name: `Testkunde ${MARKE}`, email: `buchung@${MARKE.toLowerCase()}.de` },
    });
    const mail = await mailAnlegen('Anfrage', 'Wir benötigen am 12.11.2031 vier Servicekräfte von 18:00 bis 23:00 in Hamburg.', `marie@${MARKE.toLowerCase()}.de`);
    const anfrage = await anfrageAusEmail(mail.id);
    anfrageIds.push(anfrage!.id);

    expect(anfrage!.customerId).toBe(kunde.id);
    await db.customer.delete({ where: { id: kunde.id } });
  });
});

describe('Erkennung einer Personalanfrage', () => {
  it('haelt Werbung und Rechnungen fuer keine Anfrage', () => {
    const werbung = parseRequestEmail({ subject: 'Newsletter Oktober', body: 'Jetzt 20 % Rabatt auf unsere Buerostuehle sichern!' });
    expect(werbung.isRequest).toBe(false);

    const anfrage = parseRequestEmail({ subject: 'Anfrage', body: 'Wir benötigen Personal für eine Veranstaltung und bitten um ein Angebot.' });
    expect(anfrage.isRequest).toBe(true);
  });
});
