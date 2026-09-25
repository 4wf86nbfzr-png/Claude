/**
 * Testumgebung für den HST Planer (Spec 54/55).
 *
 *   npm run seed
 *
 * Erzeugt Benutzer je Rolle, Stammdaten, Events mit Positionen und
 * Zuweisungen sowie eine Beispiel-Stundenzettel-Datei, mit der sich der
 * Abgleich sofort ausprobieren lässt.
 *
 * Die Startpasswoerter stehen in der Konsolenausgabe und sind mit
 * `mustChangePassword` markiert. Für den Produktivbetrieb setzt man
 * SEED_PASSWORD in der Umgebung.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaClient, type $Enums } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { shiftMinutes } from '../src/lib/time';

const db = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? 'Hafencity!2026';

/** Datum relativ zu heute, damit die Demo immer aktuell wirkt. */
function day(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
}

const SERVICE_TYPES = [
  { code: 'SICHERHEIT', name: 'Sicherheit & Ordnungsdienst', color: '#2563EB' },
  { code: 'GASTRO', name: 'Gastro- & Servicepersonal', color: '#0D9488' },
  { code: 'PROMOTION', name: 'Promotion & Hostessen', color: '#7C3AED' },
  { code: 'LOGISTIK', name: 'Logistik & Auf-/Abbau', color: '#B45309' },
  { code: 'FAHRSERVICE', name: 'Fahrservice', color: '#0369A1' },
  { code: 'REINIGUNG', name: 'Reinigung', color: '#4D7C0F' },
];

const QUALIFICATIONS = [
  { code: '34A', name: 'Sachkunde §34a GewO', expires: false },
  { code: 'UNTERRICHTUNG', name: 'Unterrichtung §34a GewO', expires: false },
  { code: 'FUEHRUNGSZEUGNIS', name: 'Erweitertes Führungszeugnis', expires: true },
  { code: 'ERSTHELFER', name: 'Ersthelfer', expires: true },
  { code: 'BRANDSCHUTZ', name: 'Brandschutzhelfer', expires: true },
  { code: 'GASTRO_HYGIENE', name: 'Hygieneschulung §43 IfSG', expires: true },
  { code: 'STAPLER', name: 'Staplerschein', expires: true },
  { code: 'PKW', name: 'Führerschein Klasse B', expires: false },
];

const EMPLOYEES = [
  { firstName: 'Max', lastName: 'Mustermann', city: 'Hamburg', zip: '20095', type: 'FESTANSTELLUNG', quals: ['34A', 'FUEHRUNGSZEUGNIS', 'ERSTHELFER'], areas: ['SICHERHEIT'], rate: 17.5 },
  { firstName: 'Lena', lastName: 'Bergmann', city: 'Hamburg', zip: '22767', type: 'TEILZEIT', quals: ['34A', 'BRANDSCHUTZ'], areas: ['SICHERHEIT', 'LOGISTIK'], rate: 16.8 },
  { firstName: 'Ayse', lastName: 'Yilmaz', city: 'Hamburg', zip: '21073', type: 'MINIJOB', quals: ['GASTRO_HYGIENE'], areas: ['GASTRO'], rate: 15.5 },
  { firstName: 'Jan', lastName: 'Möller', city: 'Norderstedt', zip: '22846', type: 'AUSHILFE', quals: ['UNTERRICHTUNG'], areas: ['SICHERHEIT'], rate: 15.0 },
  { firstName: 'Sophie', lastName: 'Kranz', city: 'Hamburg', zip: '20359', type: 'WERKSTUDENT', quals: ['GASTRO_HYGIENE', 'ERSTHELFER'], areas: ['GASTRO', 'PROMOTION'], rate: 15.8 },
  { firstName: 'Dennis', lastName: 'Rohde', city: 'Pinneberg', zip: '25421', type: 'FESTANSTELLUNG', quals: ['34A', 'PKW', 'FUEHRUNGSZEUGNIS'], areas: ['SICHERHEIT', 'FAHRSERVICE'], rate: 18.2 },
  { firstName: 'Marek', lastName: 'Kowalski', city: 'Hamburg', zip: '21107', type: 'AUSHILFE', quals: ['STAPLER'], areas: ['LOGISTIK'], rate: 16.0 },
  { firstName: 'Nina', lastName: 'Abel', city: 'Hamburg', zip: '22087', type: 'MINIJOB', quals: [], areas: ['PROMOTION'], rate: 15.2 },
  { firstName: 'Tobias', lastName: 'Steenbock', city: 'Buxtehude', zip: '21614', type: 'TEILZEIT', quals: ['PKW'], areas: ['FAHRSERVICE', 'LOGISTIK'], rate: 16.5 },
  { firstName: 'Katja', lastName: 'Brinkmann', city: 'Hamburg', zip: '22303', type: 'TEILZEIT', quals: ['GASTRO_HYGIENE'], areas: ['REINIGUNG', 'GASTRO'], rate: 15.9 },
];

async function main() {
  console.log('HST Planer – Testumgebung wird angelegt …\n');

  // --- Alles leeren, damit der Seed wiederholbar bleibt -------------------
  await db.$transaction([
    db.reconciliationRow.deleteMany(), db.reconciliation.deleteMany(),
    db.timeEntry.deleteMany(), db.assignment.deleteMany(),
    db.positionRequirement.deleteMany(), db.position.deleteMany(),
    db.incident.deleteMany(), db.document.deleteMany(),
    db.request.deleteMany(), db.emailMessage.deleteMany(),
    db.event.deleteMany(),
    db.availability.deleteMany(), db.employeeQualification.deleteMany(),
    db.notification.deleteMany(), db.message.deleteMany(),
    db.auditLog.deleteMany(), db.session.deleteMany(),
    db.webhookDelivery.deleteMany(), db.webhook.deleteMany(), db.apiKey.deleteMany(),
    db.user.deleteMany(), db.employee.deleteMany(),
    db.customerContact.deleteMany(), db.customerLocation.deleteMany(), db.customer.deleteMany(),
    db.partner.deleteMany(), db.qualification.deleteMany(), db.serviceType.deleteMany(),
    db.importTemplate.deleteMany(), db.setting.deleteMany(), db.counter.deleteMany(),
  ]);

  // --- Konfiguration ------------------------------------------------------
  await db.serviceType.createMany({ data: SERVICE_TYPES });
  await db.qualification.createMany({ data: QUALIFICATIONS });
  const services = Object.fromEntries((await db.serviceType.findMany()).map((s) => [s.code, s]));
  const quals = Object.fromEntries((await db.qualification.findMany()).map((q) => [q.code, q]));

  await db.setting.createMany({
    data: [
      { key: 'firma', value: { name: 'HERM Service Team e.K.', ort: 'Hamburg', email: 'dispo@hermserviceteam.com', telefon: '040 / 00 00 00', website: 'https://hermserviceteam.com' } },
      { key: 'abgleich', value: { toleranzMinuten: 15, pausenToleranzMinuten: 15, autoZuordnungAb: 0.92 } },
      { key: 'benachrichtigungen', value: { dokumentVorlaufTage: 30, eventVorlaufStunden: 24, unterbesetzungAbTagen: 3 } },
      { key: 'design', value: { akzent: '#7C3AED', logoPfad: '/logo-platzhalter.svg' } },
    ],
  });

  // --- Partner & Kunden ---------------------------------------------------
  const partner = await db.partner.create({
    data: { name: 'Elbwacht Sicherheitsdienste GmbH', contactName: 'Ralf Timm', email: 'disposition@elbwacht-demo.de', phone: '040 555 1200', city: 'Hamburg', zip: '20537', hourlyRate: '24.50' },
  });

  const customers = await Promise.all([
    db.customer.create({
      data: {
        name: 'Hafenlicht Event GmbH', shortName: 'Hafenlicht', email: 'buchung@hafenlicht-demo.de', phone: '040 123 4560',
        street: 'Große Elbstraße 12', zip: '22767', city: 'Hamburg', hourlyRate: '32.00',
        contacts: { create: [{ name: 'Marie Ahrens', role: 'Projektleitung', email: 'm.ahrens@hafenlicht-demo.de', phone: '040 123 4561', primary: true }] },
        locations: { create: [{ name: 'Fischauktionshalle', street: 'Große Elbstraße 9', zip: '22767', city: 'Hamburg' }] },
      },
    }),
    db.customer.create({
      data: {
        name: 'Nordstadion Betriebs GmbH', shortName: 'Nordstadion', email: 'orga@nordstadion-demo.de', phone: '040 987 6540',
        street: 'Sylvesterallee 7', zip: '22525', city: 'Hamburg', hourlyRate: '29.50',
        contacts: { create: [{ name: 'Thorben Kruse', role: 'Sicherheitsbeauftragter', email: 't.kruse@nordstadion-demo.de', phone: '040 987 6541', primary: true }] },
        locations: { create: [{ name: 'Nordstadion', street: 'Sylvesterallee 7', zip: '22525', city: 'Hamburg' }] },
      },
    }),
    db.customer.create({
      data: {
        name: 'Kontorhaus Messe & Kongress', shortName: 'Kontorhaus', email: 'service@kontorhaus-demo.de', phone: '040 445 2200',
        street: 'Messeplatz 1', zip: '20357', city: 'Hamburg', hourlyRate: '30.00',
        contacts: { create: [{ name: 'Beate Lohmann', role: 'Einkauf', email: 'b.lohmann@kontorhaus-demo.de', primary: true }] },
      },
    }),
  ]);

  // --- Mitarbeiter --------------------------------------------------------
  const employees = [];
  for (const [index, person] of EMPLOYEES.entries()) {
    const employee = await db.employee.create({
      data: {
        personnelNo: `HST-${String(index + 1).padStart(4, '0')}`,
        firstName: person.firstName,
        lastName: person.lastName,
        email: `${person.firstName.toLowerCase()}.${person.lastName.toLowerCase().replace(/[^a-z]/g, '')}@example.org`,
        mobile: `0170 ${1000000 + index * 13571}`,
        zip: person.zip,
        city: person.city,
        employmentType: person.type as $Enums.EmploymentType,
        hourlyRate: String(person.rate),
        preferredAreas: person.areas,
        drivingLicence: person.quals.includes('PKW') ? 'B' : null,
        partnerId: index === 9 ? partner.id : null,
        qualifications: {
          create: person.quals.map((code) => ({
            qualificationId: quals[code]!.id,
            acquiredAt: day(-400 - index * 10),
            // Ein Führungszeugnis läuft demnaechst ab – dafuer gibt es die Warnung im Dashboard.
            expiresAt: quals[code]!.expires ? day(code === 'FUEHRUNGSZEUGNIS' && index === 0 ? 18 : 300 + index * 7) : null,
          })),
        },
      },
    });
    employees.push(employee);
  }
  await db.counter.create({ data: { key: 'PERSONALNUMMER', value: EMPLOYEES.length } });

  // Verfügbarkeiten: zwei Mitarbeiter sind im Urlaub bzw. krank.
  await db.availability.createMany({
    data: [
      { employeeId: employees[7]!.id, kind: 'URLAUB', from: day(-1), to: day(9), note: 'Jahresurlaub' },
      { employeeId: employees[3]!.id, kind: 'NICHT_VERFUEGBAR', from: day(2), to: day(2), note: 'Prüfung' },
      { employeeId: employees[1]!.id, kind: 'BEVORZUGT', from: day(0), to: day(60), note: 'Abendeinsätze bevorzugt' },
    ],
  });

  // --- Benutzer je Rolle --------------------------------------------------
  const passwordHash = await hashPassword(PASSWORD);
  const users: Array<{ email: string; name: string; role: $Enums.Role; employeeId?: string; partnerId?: string; customerId?: string }> = [
    { email: 'admin@hermserviceteam.com', name: 'Systemadministration', role: 'SUPERADMIN' },
    { email: 'gf@hermserviceteam.com', name: 'Maik Herm', role: 'GESCHAEFTSFUEHRUNG' },
    { email: 'personal@hermserviceteam.com', name: 'Personalbüro HST', role: 'PERSONAL' },
    { email: 'dispo@hermserviceteam.com', name: 'Disposition HST', role: 'DISPOSITION' },
    { email: 'einsatzleitung@hermserviceteam.com', name: 'Dennis Rohde', role: 'EINSATZLEITUNG', employeeId: employees[5]!.id },
    { email: 'teamleitung@hermserviceteam.com', name: 'Lena Bergmann', role: 'TEAMLEITUNG', employeeId: employees[1]!.id },
    { email: 'max.mustermann@example.org', name: 'Max Mustermann', role: 'MITARBEITER', employeeId: employees[0]!.id },
    { email: 'ayse.yilmaz@example.org', name: 'Ayse Yilmaz', role: 'MITARBEITER', employeeId: employees[2]!.id },
    { email: 'partner@elbwacht-demo.de', name: 'Ralf Timm (Elbwacht)', role: 'SUBUNTERNEHMER', partnerId: partner.id },
    { email: 'kunde@hafenlicht-demo.de', name: 'Marie Ahrens (Hafenlicht)', role: 'KUNDE', customerId: customers[0]!.id },
  ];
  for (const user of users) {
    await db.user.create({ data: { ...user, passwordHash, mustChangePassword: true } });
  }

  // --- Events, Positionen, Zuweisungen ------------------------------------
  const year = new Date().getUTCFullYear();
  let eventCounter = 0;
  const nextRef = () => `EV-${year}-${String(++eventCounter).padStart(4, '0')}`;

  interface PositionSeed {
    title: string; service: string; count: number; start: string; end: string; pause: number;
    quals?: string[]; staff?: number[]; dressCode?: string;
  }
  interface EventSeed {
    name: string; customer: number; service: string; offset: number; start: string; end: string;
    venue: string; city: string; zip: string; meetingPoint: string; meetingTime: string;
    status: $Enums.EventStatus; priority?: $Enums.Priority;
    dressCode: string; hints?: string; notes?: string; positions: PositionSeed[];
  }

  const eventSeeds: EventSeed[] = [
    {
      name: 'Nordstadion – Heimspiel 12. Spieltag', customer: 1, service: 'SICHERHEIT', offset: 0,
      start: '17:00', end: '01:00', venue: 'Nordstadion', city: 'Hamburg', zip: '22525',
      meetingPoint: 'Eingang Süd, Container 3', meetingTime: '16:15', status: 'LAUFEND', priority: 'HOCH',
      dressCode: 'Schwarze Hose, HST-Softshelljacke, feste Schuhe',
      hints: 'Akkreditierung am Eingang Süd abholen. Funkgeräte werden gestellt.',
      notes: 'Kunde wünscht ausdrücklich Dennis Rohde als Einsatzleitung.',
      positions: [
        { title: 'Ordnungsdienst Südtribüne', service: 'SICHERHEIT', count: 4, start: '17:00', end: '01:00', pause: 30, quals: ['34A'], staff: [0, 1, 3] },
        { title: 'Einlasskontrolle Nord', service: 'SICHERHEIT', count: 2, start: '16:30', end: '23:00', pause: 30, quals: ['UNTERRICHTUNG'], staff: [5] },
      ],
    },
    {
      name: 'Hafenlicht – Firmenjubiläum Fischauktionshalle', customer: 0, service: 'GASTRO', offset: 1,
      start: '18:00', end: '02:00', venue: 'Fischauktionshalle', city: 'Hamburg', zip: '22767',
      meetingPoint: 'Personaleingang Ost', meetingTime: '17:15', status: 'BESTAETIGT',
      dressCode: 'Weißes Hemd, schwarze Hose, schwarze Schürze (wird gestellt)',
      hints: 'Bitte kein Parfüm – der Kunde serviert ein Menü mit Weinbegleitung.',
      positions: [
        { title: 'Servicekräfte Saal', service: 'GASTRO', count: 4, start: '18:00', end: '02:00', pause: 45, quals: ['GASTRO_HYGIENE'], staff: [2, 4, 9] },
        { title: 'Garderobe & Empfang', service: 'PROMOTION', count: 2, start: '17:30', end: '23:30', pause: 30, staff: [7] },
      ],
    },
    {
      name: 'Kontorhaus – Messeaufbau Halle B', customer: 2, service: 'LOGISTIK', offset: 3,
      start: '06:00', end: '14:00', venue: 'Messe Hamburg, Halle B', city: 'Hamburg', zip: '20357',
      meetingPoint: 'Tor 4, Anmeldung Logistik', meetingTime: '05:45', status: 'TEILBESETZT', priority: 'NORMAL',
      dressCode: 'Arbeitskleidung, Sicherheitsschuhe S3 (Pflicht)',
      hints: 'Ohne Sicherheitsschuhe ist kein Zutritt möglich.',
      positions: [
        { title: 'Auf- und Abbauhelfer', service: 'LOGISTIK', count: 6, start: '06:00', end: '14:00', pause: 45, staff: [6, 8] },
        { title: 'Staplerfahrer', service: 'LOGISTIK', count: 1, start: '06:00', end: '14:00', pause: 45, quals: ['STAPLER'], staff: [6] },
      ],
    },
    {
      name: 'Hafenlicht – Shuttle Gäste Kongress', customer: 0, service: 'FAHRSERVICE', offset: 5,
      start: '07:30', end: '19:00', venue: 'Hotel Atlantik / Messe', city: 'Hamburg', zip: '20095',
      meetingPoint: 'Hotelvorfahrt', meetingTime: '07:15', status: 'PLANUNG',
      dressCode: 'Dunkler Anzug, Krawatte',
      positions: [
        { title: 'Fahrservice Limousine', service: 'FAHRSERVICE', count: 2, start: '07:30', end: '19:00', pause: 60, quals: ['PKW'], staff: [8] },
      ],
    },
    {
      name: 'Nordstadion – Grundreinigung nach Spieltag', customer: 1, service: 'REINIGUNG', offset: -6,
      start: '07:00', end: '13:00', venue: 'Nordstadion', city: 'Hamburg', zip: '22525',
      meetingPoint: 'Wirtschaftshof', meetingTime: '06:50', status: 'ABGESCHLOSSEN',
      dressCode: 'Arbeitsjacke mit Logo',
      positions: [
        { title: 'Reinigungskräfte Tribünen', service: 'REINIGUNG', count: 3, start: '07:00', end: '13:00', pause: 30, staff: [9, 2, 4] },
      ],
    },
  ];

  const createdEvents = [];
  for (const seed of eventSeeds) {
    const event = await db.event.create({
      data: {
        reference: nextRef(),
        name: seed.name,
        customerId: customers[seed.customer]!.id,
        serviceTypeId: services[seed.service]!.id,
        contactName: 'Zentrale Disposition',
        contactPhone: '040 / 00 00 00',
        venue: seed.venue, city: seed.city, zip: seed.zip,
        date: day(seed.offset),
        startTime: seed.start, endTime: seed.end,
        meetingPoint: seed.meetingPoint, meetingTime: seed.meetingTime,
        status: seed.status, priority: seed.priority ?? 'NORMAL',
        dressCode: seed.dressCode, hints: seed.hints ?? null, notesInternal: seed.notes ?? null,
        operationLeadId: employees[5]!.id,
        eventKind: seed.service === 'SICHERHEIT' ? 'Sportveranstaltung' : 'Veranstaltung',
      },
    });

    for (const [order, position] of seed.positions.entries()) {
      const created = await db.position.create({
        data: {
          eventId: event.id,
          title: position.title,
          serviceTypeId: services[position.service]!.id,
          requiredCount: position.count,
          startTime: position.start, endTime: position.end,
          breakMinutes: position.pause,
          dressCode: position.dressCode ?? null,
          sortOrder: order,
          requirements: {
            create: (position.quals ?? []).map((code) => ({ qualificationId: quals[code]!.id, mandatory: true })),
          },
        },
      });

      for (const [slot, employeeIndex] of (position.staff ?? []).entries()) {
        const past = seed.offset < 0;
        await db.assignment.create({
          data: {
            eventId: event.id,
            positionId: created.id,
            employeeId: employees[employeeIndex]!.id,
            partnerId: employeeIndex === 9 ? partner.id : null,
            status: past ? 'ERSCHIENEN' : slot === 0 ? 'ZUGESAGT' : slot === 1 ? 'ANGEFRAGT' : 'EINGETEILT',
            roleInTeam: slot === 0 ? 'TEAMLEITUNG' : 'MITARBEITER',
            plannedStart: position.start, plannedEnd: position.end,
            plannedBreakMinutes: position.pause,
            respondedAt: slot === 0 || past ? new Date() : null,
          },
        });
      }
    }
    createdEvents.push(event);
  }
  await db.counter.create({ data: { key: `EV-${year}`, value: eventCounter } });

  // --- Ist-Zeiten für den abgeschlossenen Einsatz ------------------------
  const pastEvent = createdEvents[4]!;
  const pastAssignments = await db.assignment.findMany({ where: { eventId: pastEvent.id } });
  for (const [index, assignment] of pastAssignments.entries()) {
    const start = index === 1 ? '07:12' : '07:00';
    const end = index === 2 ? '13:40' : '13:00';
    await db.timeEntry.create({
      data: {
        employeeId: assignment.employeeId,
        eventId: pastEvent.id,
        positionId: assignment.positionId,
        assignmentId: assignment.id,
        date: pastEvent.date,
        start, end, breakMinutes: 30,
        minutes: shiftMinutes(start, end, 30) ?? 0,
        source: 'IMPORT',
        status: 'GEPRUEFT',
      },
    });
  }

  // --- Offene Anfragen ----------------------------------------------------
  await db.request.createMany({
    data: [
      {
        reference: `AN-${year}-0001`, channel: 'WEBSITE', status: 'NEU',
        company: 'Elbpanorama Catering GmbH', contactPerson: 'Jonas Reimer',
        email: 'j.reimer@elbpanorama-demo.de', phone: '040 667 8800',
        eventName: 'Weihnachtsfeier Reederei', eventDate: day(35), startTime: '18:00', endTime: '01:00',
        location: 'Hamburg, Speicherstadt', employeesNeeded: 6, serviceType: 'GASTRO',
        message: 'Wir brauchen sechs Servicekräfte für eine Weihnachtsfeier mit 120 Gästen.',
        confidence: 0.86, needsReview: true, customerId: null,
      },
      {
        reference: `AN-${year}-0002`, channel: 'EMAIL', status: 'IN_PRUEFUNG',
        company: null, contactPerson: 'Frau Petersen', email: 'petersen@gmx.de',
        eventName: 'Personalanfrage', eventDate: null, startTime: null, endTime: null,
        location: 'Hamburg', employeesNeeded: null, serviceType: 'SICHERHEIT',
        message: 'Guten Tag, wir benötigen Sicherheitspersonal für eine Veranstaltung. Bitte um Rückruf.',
        missingFields: ['Datum', 'Startzeit', 'Endzeit', 'Anzahl Mitarbeiter'],
        confidence: 0.29, needsReview: true,
      },
    ],
  });
  await db.counter.create({ data: { key: `AN-${year}`, value: 2 } });

  // --- Vorfall ------------------------------------------------------------
  await db.incident.create({
    data: {
      eventId: createdEvents[0]!.id, employeeId: employees[3]!.id,
      kind: 'VERSPAETET', status: 'OFFEN', priority: 'HOCH',
      description: 'Mitarbeiter meldet 20 Minuten Verspätung wegen Sperrung der S-Bahn.',
    },
  });

  // --- Importvorlagen -----------------------------------------------------
  await db.importTemplate.createMany({
    data: [
      {
        name: 'Standard HST Stundenzettel', kind: 'TIMESHEET',
        mapping: { name: 'Mitarbeiter', date: 'Datum', start: 'Beginn', end: 'Ende', break: 'Pause', event: 'Event', position: 'Position' },
        options: { toleranzMinuten: 15 },
      },
      {
        name: 'Partner Stundenzettel (Elbwacht)', kind: 'TIMESHEET',
        mapping: { lastName: 'Nachname', firstName: 'Vorname', date: 'Datum', start: 'Von', end: 'Bis', break: 'Pause (Min)', event: 'Objekt' },
        options: { toleranzMinuten: 20 },
      },
    ],
  });

  // --- Beispieldatei für den Abgleich ------------------------------------
  await writeSampleTimesheet(createdEvents[0]!, employees);

  const counts = {
    Benutzer: await db.user.count(), Mitarbeiter: await db.employee.count(),
    Kunden: await db.customer.count(), Partner: await db.partner.count(),
    Events: await db.event.count(), Positionen: await db.position.count(),
    Zuweisungen: await db.assignment.count(), Anfragen: await db.request.count(),
  };
  console.log('Angelegt:', counts);
  console.log(`\nAnmeldung mit dem Passwort: ${PASSWORD}`);
  for (const user of users) console.log(`  ${user.role.padEnd(20)} ${user.email}`);
  console.log('\nBeispiel-Stundenzettel: beispiele/stundenzettel-beispiel.xlsx');
  console.log('Damit lässt sich unter "Abgleiche" sofort ein Abgleich starten.\n');
}

/**
 * Erzeugt einen realistischen Stundenzettel mit genau den Fällen, die der
 * Abgleich erkennen soll: gedrehter Name, Tippfehler, Zeitabweichung,
 * unbekannte Person, doppelte Zeile und eine fehlende Ist-Zeit.
 */
async function writeSampleTimesheet(event: { id: string; name: string; date: Date }, employees: Array<{ firstName: string; lastName: string }>) {
  const assignments = await db.assignment.findMany({
    where: { eventId: event.id },
    include: { employee: true },
    orderBy: { createdAt: 'asc' },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HST Planer';
  const ws = wb.addWorksheet('Stunden');
  ws.addRow(['Mitarbeiter', 'Datum', 'Beginn', 'Ende', 'Pause', 'Event', 'Position']);
  ws.getRow(1).font = { bold: true };

  const date = `${String(event.date.getUTCDate()).padStart(2, '0')}.${String(event.date.getUTCMonth() + 1).padStart(2, '0')}.${event.date.getUTCFullYear()}`;
  const rows: Array<[string, string, string, string, number, string, string]> = [];

  assignments.forEach((assignment, index) => {
    const e = assignment.employee;
    // Letzte Zuweisung bewusst weglassen -> "geplant, keine Ist-Zeit"
    if (index === assignments.length - 1) return;

    const name =
      index === 0 ? `${e.lastName} ${e.firstName}`                       // gedrehte Reihenfolge
      : index === 1 ? `${e.firstName} ${e.lastName.replace(/(.)(.)/, '$2$1')}` // Tippfehler (Vertauschung)
      : `${e.firstName} ${e.lastName}`;

    const start = index === 2 ? '17:05' : assignment.plannedStart ?? '17:00';
    const end = index === 2 ? '01:30' : assignment.plannedEnd ?? '01:00';
    rows.push([name, date, start, end, assignment.plannedBreakMinutes, event.name, 'Ordnungsdienst']);
  });

  // Unbekannte Person und eine doppelte Zeile ergänzen.
  rows.push(['Petra Schneider', date, '17:00', '01:00', 30, event.name, 'Ordnungsdienst']);
  if (rows[0]) rows.push([...rows[0]]);

  rows.forEach((row) => ws.addRow(row));
  ws.columns.forEach((column) => { column.width = 24; });

  const dir = path.resolve('beispiele');
  await mkdir(dir, { recursive: true });
  await wb.xlsx.writeFile(path.join(dir, 'stundenzettel-beispiel.xlsx'));

  // Dieselben Daten zusätzlich als CSV, damit auch der CSV-Weg testbar ist.
  const csv = ['Mitarbeiter;Datum;Beginn;Ende;Pause;Event;Position', ...rows.map((r) => r.join(';'))].join('\n');
  await writeFile(path.join(dir, 'stundenzettel-beispiel.csv'), `﻿${csv}\n`, 'utf8');
  void employees;
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(() => db.$disconnect());
