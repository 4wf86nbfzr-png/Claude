/**
 * Taegliche Aufgaben (Spec 28/49).
 *
 *   npm run jobs:daily
 *
 * Empfohlener Cron-Eintrag (einmal morgens):
 *   0 6 * * * cd /srv/hst-planer && npm run jobs:daily >> /var/log/hst-jobs.log 2>&1
 *
 * Die Aufgaben sind so gebaut, dass ein zweiter Durchlauf am selben Tag
 * keine doppelten Benachrichtigungen erzeugt (`dedupeKey`).
 */
import { config } from 'dotenv';
config({ path: '.env', quiet: true });

async function main() {
  const { db } = await import('../src/lib/db');
  const { notifyRoles, DISPO_ROLES, notifyUsers } = await import('../src/lib/notify');
  const { pruneSessions } = await import('../src/lib/auth/session');
  const { papierkorbLeeren } = await import('../src/lib/domain/documents');
  const { besetzungAus, EVENT_MIT_BESETZUNG } = await import('../src/lib/queries/coverage');
  const { formatDateDE, toDateOnly } = await import('../src/lib/time');

  const heute = toDateOnly(new Date());
  const heuteSchluessel = heute.toISOString().slice(0, 10);
  const bericht: string[] = [];

  // 1. Ablaufende Nachweise -------------------------------------------------
  const einstellungen = await db.setting.findUnique({ where: { key: 'benachrichtigungen' } });
  const werte = (einstellungen?.value ?? {}) as { dokumentVorlaufTage?: number; eventVorlaufStunden?: number; unterbesetzungAbTagen?: number };
  const vorlaufTage = werte.dokumentVorlaufTage ?? 30;

  const ablaufend = await db.employeeQualification.findMany({
    where: {
      expiresAt: { not: null, lte: new Date(heute.getTime() + vorlaufTage * 86400000) },
      employee: { deletedAt: null, active: true },
    },
    include: { employee: { select: { firstName: true, lastName: true, id: true } }, qualification: { select: { name: true } } },
  });
  for (const nachweis of ablaufend) {
    const tage = Math.ceil((nachweis.expiresAt!.getTime() - heute.getTime()) / 86400000);
    await notifyRoles(DISPO_ROLES, {
      kind: 'DOKUMENT_LAEUFT_AB',
      title: `${nachweis.qualification.name} laeuft ab: ${nachweis.employee.firstName} ${nachweis.employee.lastName}`,
      body: tage < 0 ? `seit ${Math.abs(tage)} Tagen abgelaufen` : `noch ${tage} Tage gueltig (bis ${formatDateDE(nachweis.expiresAt!)})`,
      link: `/mitarbeiter/${nachweis.employee.id}`,
      dedupeKey: `nachweis:${nachweis.id}:${Math.floor(tage / 7)}`,
    });
  }
  bericht.push(`${ablaufend.length} ablaufende Nachweise geprueft`);

  // 2. Events morgen: Erinnerung an die eingeteilten Kraefte ----------------
  const morgen = new Date(heute.getTime() + 86400000);
  const morgenEvents = await db.event.findMany({
    where: { deletedAt: null, date: { gte: morgen, lt: new Date(morgen.getTime() + 86400000) }, status: { notIn: ['STORNIERT'] } },
    include: {
      assignments: {
        where: { deletedAt: null, status: { in: ['ZUGESAGT', 'EINGETEILT'] } },
        include: { employee: { select: { user: { select: { id: true } } } } },
      },
    },
  });
  let erinnerungen = 0;
  for (const event of morgenEvents) {
    const userIds = event.assignments.map((a) => a.employee.user?.id).filter((v): v is string => Boolean(v));
    erinnerungen += await notifyUsers(userIds, {
      kind: 'EVENT_MORGEN',
      title: `Morgen: ${event.name}`,
      body: `${event.startTime ?? '–'}–${event.endTime ?? '–'}${event.meetingPoint ? ` · Treffpunkt: ${event.meetingPoint}${event.meetingTime ? ` um ${event.meetingTime}` : ''}` : ''}`,
      link: '/meine-einsaetze',
      dedupeKey: `event-morgen:${event.id}`,
    });
  }
  bericht.push(`${erinnerungen} Einsatzerinnerungen fuer morgen verschickt`);

  // 3. Unterbesetzte Events in den naechsten Tagen --------------------------
  const vorlaufUnterbesetzung = werte.unterbesetzungAbTagen ?? 3;
  const bald = await db.event.findMany({
    where: {
      deletedAt: null,
      date: { gte: heute, lte: new Date(heute.getTime() + vorlaufUnterbesetzung * 86400000) },
      status: { notIn: ['STORNIERT', 'ABGESCHLOSSEN', 'ABGERECHNET'] },
    },
    select: { id: true, name: true, date: true, ...EVENT_MIT_BESETZUNG },
  });
  let unterbesetzt = 0;
  for (const event of bald) {
    const b = besetzungAus(event.positions);
    if (b.offen === 0) continue;
    unterbesetzt++;
    await notifyRoles(DISPO_ROLES, {
      kind: 'EVENT_UNTERBESETZT',
      title: `${b.offen} offene Positionen: ${event.name}`,
      body: `Einsatz am ${formatDateDE(event.date)} · ${b.ist} von ${b.soll} besetzt`,
      link: `/events/${event.id}/mitarbeiter`,
      dedupeKey: `unterbesetzt:${event.id}:${heuteSchluessel}`,
    });
  }
  bericht.push(`${unterbesetzt} unterbesetzte Events gemeldet`);

  // 4. Laufende Events auf "LAUFEND" setzen, vergangene abschliessen --------
  const gestartet = await db.event.updateMany({
    where: { deletedAt: null, date: { gte: heute, lt: morgen }, status: { in: ['BESETZT', 'BESTAETIGT'] } },
    data: { status: 'LAUFEND' },
  });
  const beendet = await db.event.updateMany({
    where: { deletedAt: null, date: { lt: heute }, status: { in: ['LAUFEND', 'BESETZT', 'BESTAETIGT', 'TEILBESETZT'] } },
    data: { status: 'ABGESCHLOSSEN' },
  });
  bericht.push(`${gestartet.count} Events auf "laufend", ${beendet.count} auf "abgeschlossen" gesetzt`);

  // 5. Aufraeumen -----------------------------------------------------------
  const sitzungen = await pruneSessions();
  const dateien = await papierkorbLeeren(30);
  bericht.push(`${sitzungen} abgelaufene Sitzungen und ${dateien} Dateien im Papierkorb entfernt`);

  console.log(`[${new Date().toISOString()}] Taegliche Aufgaben:`);
  for (const zeile of bericht) console.log(`  · ${zeile}`);
  await db.$disconnect();
}

main().catch((fehler) => { console.error(fehler); process.exit(1); });
