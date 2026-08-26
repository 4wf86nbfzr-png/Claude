import type { Id, Incident, IsoDateTime, Report } from '../domain/types';
import type { IncidentPriority, IncidentStatus } from '../domain/enums';

/**
 * Incident-Workflow.
 *
 * Meldungen aus dem Produkt werden nach Kategorie automatisch eingestuft.
 * Kritische Faelle (Gewalt, Grenzverletzung, Ausnutzung) landen sofort oben
 * und brauchen fuer eine Sperrung zwei Augenpaare.
 */
export const REPORT_PRIORITY: Record<Report['category'], IncidentPriority> = {
  grenzverletzung: 'critical',
  belaestigung: 'critical',
  betrug: 'high',
  diskriminierung: 'high',
  falsche_angaben: 'normal',
  nicht_erschienen: 'normal',
  sonstiges: 'low',
};

/** Zusagen zur Bearbeitungszeit -- werden im Dashboard gegen die Uhr geprueft. */
export const RESPONSE_TARGET_HOURS: Record<IncidentPriority, number> = {
  critical: 1,
  high: 8,
  normal: 48,
  low: 120,
};

export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  new: ['triaged', 'closed'],
  triaged: ['in_progress', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved: ['closed', 'in_progress'],
  closed: [],
};

export class IncidentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncidentError';
  }
}

export function incidentFromReport(report: Report, id: Id, now: IsoDateTime): Incident {
  const priority = REPORT_PRIORITY[report.category];
  return {
    id,
    priority,
    status: 'new',
    title: titleFor(report.category),
    // Der Freitext der Meldung landet bewusst NICHT in der Zusammenfassung,
    // damit Listenansichten keine sensiblen Inhalte zeigen.
    summary: `Meldung der Kategorie „${titleFor(report.category)}“. Details nur in der Fallakte.`,
    assignedTo: null,
    requiresFourEyes: priority === 'critical' || priority === 'high',
    secondApproverId: null,
    createdAt: now,
    resolvedAt: null,
  };
}

export function transitionIncident(
  incident: Incident,
  to: IncidentStatus,
  now: IsoDateTime,
): Incident {
  if (!INCIDENT_TRANSITIONS[incident.status].includes(to)) {
    throw new IncidentError(`Übergang von "${incident.status}" nach "${to}" ist nicht vorgesehen.`);
  }
  if (to === 'in_progress' && !incident.assignedTo) {
    throw new IncidentError('Ein Fall in Bearbeitung braucht eine zuständige Person.');
  }
  return {
    ...incident,
    status: to,
    resolvedAt: to === 'resolved' ? now : incident.resolvedAt,
  };
}

/** Ist die Zusage zur Bearbeitungszeit ueberschritten? */
export function isOverdue(incident: Incident, now: IsoDateTime): boolean {
  if (incident.status === 'resolved' || incident.status === 'closed') return false;
  const target = RESPONSE_TARGET_HOURS[incident.priority] * 3_600_000;
  return new Date(now).getTime() - new Date(incident.createdAt).getTime() > target;
}

/** Sortierung fuer das Dashboard: ueberfaellig zuerst, dann nach Dringlichkeit. */
export function triageOrder(incidents: readonly Incident[], now: IsoDateTime): Incident[] {
  const rank: Record<IncidentPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
  return [...incidents].sort((a, b) => {
    const oa = isOverdue(a, now) ? 0 : 1;
    const ob = isOverdue(b, now) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function titleFor(category: Report['category']): string {
  switch (category) {
    case 'belaestigung':
      return 'Belästigung';
    case 'diskriminierung':
      return 'Diskriminierung';
    case 'betrug':
      return 'Betrugsverdacht';
    case 'nicht_erschienen':
      return 'Nicht erschienen';
    case 'grenzverletzung':
      return 'Grenzverletzung';
    case 'falsche_angaben':
      return 'Falsche Angaben im Profil';
    default:
      return 'Sonstige Meldung';
  }
}

/** Meldewege, die in der App immer erreichbar sind. */
export const REPORT_CATEGORY_LABELS: Array<{ key: Report['category']; label: string; easy: string }> = [
  { key: 'grenzverletzung', label: 'Jemand hat meine Grenze überschritten', easy: 'Jemand hat etwas gemacht, das ich nicht wollte.' },
  { key: 'belaestigung', label: 'Ich werde belästigt oder bedroht', easy: 'Jemand ist gemein zu mir oder macht mir Angst.' },
  { key: 'betrug', label: 'Es geht um Geld oder Betrug', easy: 'Jemand will Geld von mir. Das stimmt nicht.' },
  { key: 'diskriminierung', label: 'Ich werde benachteiligt', easy: 'Jemand behandelt mich schlecht.' },
  { key: 'nicht_erschienen', label: 'Die Person ist nicht gekommen', easy: 'Die Person war nicht da.' },
  { key: 'falsche_angaben', label: 'Die Angaben im Profil stimmen nicht', easy: 'Im Profil steht etwas Falsches.' },
  { key: 'sonstiges', label: 'Etwas anderes', easy: 'Es ist etwas anderes passiert.' },
];
