import { PrismaClient, $Enums } from '@prisma/client';

/**
 * Bewerber, Objekte und Schulungen (SecPlan 2, Bereich PERSONAL und EINSÄTZE).
 *
 * Alles erfundene Testdaten. Die Löschdaten bei den Bewerbern sind aus
 * dem Löschkonzept gerechnet (Absage + 6 Monate), damit die Seite
 * „Löschfristen" nicht nur Regeln zeigt, sondern auch einen Fall, der
 * fällig ist.
 */

const TAG = 86_400_000;

interface MitarbeiterKurz { id: string; firstName: string; lastName: string }
interface KundeKurz { id: string; name: string }

export async function seedPersonalUndObjekte(
  db: PrismaClient,
  employees: MitarbeiterKurz[],
  customers: KundeKurz[],
): Promise<void> {
  const heute = new Date();
  const tag = (versatz: number) => new Date(heute.getTime() + versatz * TAG);

  // --- Bewerber -----------------------------------------------------------
  const bewerber: Array<{
    firstName: string; lastName: string; email: string; phone: string; city: string;
    source: string; position: string; status: $Enums.ApplicantStatus;
    appliedAt: Date; decidedAt: Date | null; deleteAt: Date | null; note: string | null;
  }> = [
    {
      firstName: 'Kevin', lastName: 'Radtke', email: 'k.radtke@example.org', phone: '0176 2233445',
      city: 'Hamburg', source: 'Stellenanzeige Jobs-Seite', position: 'Sicherheitsmitarbeiter § 34a',
      status: 'IN_PRUEFUNG', appliedAt: tag(-9), decidedAt: null, deleteAt: null,
      note: 'Sachkunde vorhanden, Nachweis liegt als Kopie vor.',
    },
    {
      firstName: 'Melike', lastName: 'Aydın', email: 'm.aydin@example.org', phone: '0151 9988776',
      city: 'Norderstedt', source: 'Empfehlung', position: 'Servicekraft Gastronomie',
      status: 'GESPRAECH', appliedAt: tag(-16), decidedAt: null, deleteAt: null,
      note: 'Gespräch am Donnerstag, 14 Uhr im Büro.',
    },
    {
      firstName: 'Tobias', lastName: 'Engel', email: 't.engel@example.org', phone: '0160 4455667',
      city: 'Pinneberg', source: 'Initiativbewerbung', position: 'Fahrservice',
      status: 'ZUSAGE', appliedAt: tag(-30), decidedAt: tag(-4), deleteAt: null,
      note: 'Führerschein Klasse B seit 2018, Personenbeförderungsschein beantragt.',
    },
    {
      firstName: 'Saskia', lastName: 'Bohnert', email: 's.bohnert@example.org', phone: '0177 1122334',
      city: 'Hamburg', source: 'Stellenanzeige Jobs-Seite', position: 'Promotion / Hostess',
      status: 'ABSAGE', appliedAt: tag(-200), decidedAt: tag(-190),
      deleteAt: tag(-10), // Absage + 6 Monate ist erreicht: erscheint als fällig
      note: null,
    },
    {
      firstName: 'Dariusz', lastName: 'Kowal', email: 'd.kowal@example.org', phone: '0152 7788990',
      city: 'Hamburg', source: 'Jobmesse', position: 'Sicherheitsmitarbeiter § 34a',
      status: 'ABSAGE', appliedAt: tag(-120), decidedAt: tag(-110), deleteAt: tag(70),
      note: null,
    },
    {
      firstName: 'Anna-Lena', lastName: 'Voss', email: 'a.voss@example.org', phone: '0170 5566778',
      city: 'Ahrensburg', source: 'Empfehlung', position: 'Reinigungskraft',
      status: 'EINGEGANGEN', appliedAt: tag(-2), decidedAt: null, deleteAt: null, note: null,
    },
  ];
  await db.applicant.createMany({ data: bewerber });

  // --- Objekte ------------------------------------------------------------
  await db.objekt.createMany({
    data: [
      {
        name: 'Kontorhaus Rödingsmarkt – Empfang', shortName: 'Kontorhaus',
        street: 'Rödingsmarkt 12', zip: '20459', city: 'Hamburg',
        customerId: customers[2]?.id ?? null,
        leadId: employees[5]?.id ?? null,
        serviceNote: 'Empfang Mo–Fr 07:00–18:00, Schlüsselausgabe, Besucheranmeldung.',
      },
      {
        name: 'Hafenlager Süd – Werkschutz', shortName: 'Hafenlager',
        street: 'Am Kaiserkai 7', zip: '20457', city: 'Hamburg',
        customerId: customers[0]?.id ?? null,
        leadId: null,
        serviceNote: 'Revierdienst nachts, zwei Rundgänge je Schicht.',
        notesInternal: 'Objektleitung noch nicht benannt – bitte bis Quartalsende klären.',
      },
    ],
  });

  // --- Schulungen ---------------------------------------------------------
  const unterweisung = await db.training.create({
    data: {
      title: 'Jährliche Unterweisung Arbeitssicherheit',
      description: 'Pflichtunterweisung nach § 12 ArbSchG, einmal jährlich.',
      startsAt: tag(-40), endsAt: tag(-40),
      location: 'Büro Hamburg, Schulungsraum', seats: 20,
      mandatory: true, repeatMonths: 12,
    },
  });

  const datenschutz = await db.training.create({
    data: {
      title: 'Datenschutz und Verschwiegenheit',
      description: 'Verpflichtung auf das Datengeheimnis, Umgang mit Kundendaten, Meldewege bei Vorfällen.',
      startsAt: tag(-75), endsAt: tag(-75),
      location: 'Büro Hamburg, Schulungsraum', seats: 20,
      mandatory: true, repeatMonths: 24,
    },
  });

  await db.training.create({
    data: {
      title: 'Deeskalation im Einlassbereich',
      description: 'Praxistraining für Ordnungsdienst und Einlasskontrolle.',
      startsAt: tag(21), endsAt: tag(21),
      location: 'Nordstadion, Konferenzraum B', seats: 12,
      mandatory: false,
    },
  });

  // Die ersten Kräfte haben teilgenommen, die letzten nicht – so hat die
  // Schulungsseite sowohl Erledigtes als auch Offenes zu zeigen.
  const teilnahmen: Array<{ trainingId: string; employeeId: string; result: $Enums.TrainingResult }> = [];
  employees.slice(0, 6).forEach((person, index) => {
    teilnahmen.push({ trainingId: unterweisung.id, employeeId: person.id, result: index === 5 ? 'NICHT_BESTANDEN' : 'BESTANDEN' });
  });
  employees.slice(0, 4).forEach((person) => {
    teilnahmen.push({ trainingId: datenschutz.id, employeeId: person.id, result: 'TEILGENOMMEN' });
  });
  if (teilnahmen.length > 0) await db.trainingParticipant.createMany({ data: teilnahmen });

  console.log('  Bewerber, Objekte und Schulungen angelegt.');
}
