import {
  DgsRegistry,
  EasyLanguageRegistry,
  createCounterIds,
  createMemoryContext,
  demoSeed,
  expiringSoon,
  incidentFromReport,
  fixedClock,
  systemClock,
  DEMO_NOW,
  triageOrder,
  SupportService,
  type Clock,
  type DataContext,
  type Report,
} from '@miteinander/core';

/**
 * Zeitquelle.
 *
 * Im Demo-Modus rechnet der Adminbereich auf dem Zeitpunkt des Datenstands.
 * Mit der echten Uhr waeren die Demo-Daten sonst unsinnig -- ein Nachweis,
 * der im Datenstand "laeuft bald ab" bedeutet, waere nach ein paar Monaten
 * einfach abgelaufen und die Uebersicht zeigte nichts mehr.
 * Sobald der Supabase-Adapter angebunden ist, gilt hier wieder systemClock.
 */
const DEMO_MODE = true;

export function clock(): Clock {
  return DEMO_MODE ? fixedClock(DEMO_NOW) : systemClock;
}

/**
 * Datenzugriff des Adminbereichs.
 *
 * Im Demo-Modus laeuft alles gegen die In-Memory-Schicht. Fuer den Betrieb
 * wird hier der Supabase-Adapter eingehaengt -- die Seiten selbst greifen
 * nie direkt auf eine Datenbank zu.
 */
let context: DataContext | null = null;
let dgsRegistry: DgsRegistry | null = null;
let easyRegistry: EasyLanguageRegistry | null = null;

export function db(): DataContext {
  if (!context) {
    context = createMemoryContext(demoSeed);
    // Eine Beispielmeldung, damit der Vorfallbereich nicht leer wirkt.
    const now = clock().now();
    const report: Report = {
      id: 'rep_demo_1',
      reporterId: 'u_seeker_2',
      subjectUserId: 'u_provider_3',
      bookingId: null,
      conversationId: null,
      category: 'nicht_erschienen' as const,
      description: 'Die Person war zum vereinbarten Zeitpunkt nicht da.',
      createdAt: now,
      incidentId: null,
    };
    const incident = incidentFromReport(report, 'inc_demo_1', now);
    report.incidentId = incident.id;
    void context.safety.saveReport(report);
    void context.safety.saveIncident(incident);
  }
  return context;
}

export function dgs(): DgsRegistry {
  if (!dgsRegistry) dgsRegistry = new DgsRegistry();
  return dgsRegistry;
}

export function easy(): EasyLanguageRegistry {
  if (!easyRegistry) easyRegistry = new EasyLanguageRegistry();
  return easyRegistry;
}

export function service(): SupportService {
  return new SupportService(db(), clock(), createCounterIds(5000));
}

export async function dashboardCounters() {
  const data = db();
  const today = clock().today();
  const [verifications, incidents, bookings, requests] = await Promise.all([
    data.verifications.all(),
    data.safety.incidents(),
    data.bookings.list(),
    data.requests.list(),
  ]);

  return {
    offenePruefungen: verifications.filter((v) => v.status === 'pending').length,
    ablaufendeNachweise: expiringSoon(verifications, today, 30),
    offeneVorfaelle: triageOrder(
      incidents.filter((i) => i.status !== 'resolved' && i.status !== 'closed'),
      clock().now(),
    ),
    anstehendeTermine: bookings.filter((b) => b.status === 'confirmed').length,
    offeneAnfragen: requests.filter((r) => r.status === 'open').length,
    dgsAbdeckung: dgs().coverage(),
    leichteSprache: easy().coverage(),
  };
}
