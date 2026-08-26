import type { IsoDateTime } from '../domain/types';

/**
 * Aufbewahrungs- und Loeschkonzept.
 *
 * Jede Datenart hat eine Frist und eine Begruendung. Fristen, die aus
 * gesetzlichen Pflichten stammen (z. B. Rechnungen), sind als solche
 * gekennzeichnet -- sie sind nicht durch einen Loeschwunsch verkuerzbar,
 * wohl aber gesperrt.
 */
export interface RetentionRule {
  entity: string;
  /** Aufbewahrung in Tagen ab dem ausloesenden Ereignis. */
  days: number;
  trigger: string;
  reason: string;
  /** Gesetzliche Pflicht -- Loeschung erst nach Fristablauf. */
  statutory: boolean;
  /** Was stattdessen passiert, wenn nicht geloescht werden darf. */
  onDeletionRequest: 'delete' | 'anonymize' | 'restrict';
}

export const RETENTION_RULES: RetentionRule[] = [
  {
    entity: 'messages',
    days: 180,
    trigger: 'Ende der Unterhaltung',
    reason: 'Nachvollziehbarkeit bei Beschwerden über einen Termin.',
    statutory: false,
    onDeletionRequest: 'delete',
  },
  {
    entity: 'bookings',
    days: 365 * 3,
    trigger: 'Abschluss des Termins',
    reason: 'Nachweis über erbrachte Leistungen und Streitfälle.',
    statutory: false,
    onDeletionRequest: 'anonymize',
  },
  {
    entity: 'payments',
    days: 365 * 10,
    trigger: 'Rechnungsstellung',
    reason: 'Handels- und steuerrechtliche Aufbewahrungspflicht (§ 147 AO, § 257 HGB).',
    statutory: true,
    onDeletionRequest: 'restrict',
  },
  {
    entity: 'provider_verifications',
    days: 365 * 5,
    trigger: 'Ende der Anbietertätigkeit',
    reason: 'Nachweis der Sorgfalt bei der Vermittlung.',
    statutory: false,
    onDeletionRequest: 'anonymize',
  },
  {
    entity: 'incidents',
    days: 365 * 5,
    trigger: 'Abschluss des Vorfalls',
    reason: 'Schutzkonzept und Wiederholungserkennung.',
    statutory: false,
    onDeletionRequest: 'anonymize',
  },
  {
    entity: 'consents',
    days: 365 * 3,
    trigger: 'Widerruf der Einwilligung',
    reason: 'Nachweispflicht nach Art. 7 Abs. 1 DSGVO.',
    statutory: true,
    onDeletionRequest: 'restrict',
  },
  {
    entity: 'audit_events',
    days: 365,
    trigger: 'Eintrag',
    reason: 'Revisionsfähigkeit sicherheitsrelevanter Vorgänge.',
    statutory: false,
    onDeletionRequest: 'restrict',
  },
  {
    entity: 'support_seeker_profiles',
    days: 30,
    trigger: 'Kontolöschung',
    reason: 'Kurze Karenz für versehentliche Löschung, danach endgültig.',
    statutory: false,
    onDeletionRequest: 'delete',
  },
  {
    entity: 'sensitive_support_needs',
    days: 0,
    trigger: 'Widerruf der Einwilligung',
    reason: 'Ohne Einwilligung entfällt die Rechtsgrundlage sofort.',
    statutory: false,
    onDeletionRequest: 'delete',
  },
];

const RULE_INDEX = new Map(RETENTION_RULES.map((r) => [r.entity, r]));

export function getRetentionRule(entity: string): RetentionRule | undefined {
  return RULE_INDEX.get(entity);
}

export interface DeletionPlanItem {
  entity: string;
  action: RetentionRule['onDeletionRequest'];
  /** Wann die Daten tatsaechlich verschwinden. */
  effectiveAt: IsoDateTime;
  explanation: string;
}

/**
 * Erstellt den Loeschplan zu einem Kontoloeschungswunsch.
 * Die Person sieht damit vor der Bestaetigung genau, was wann passiert.
 */
export function buildDeletionPlan(requestedAt: IsoDateTime): DeletionPlanItem[] {
  const base = new Date(requestedAt).getTime();
  return RETENTION_RULES.map((rule) => {
    const effective = new Date(base + rule.days * 86_400_000).toISOString();
    const explanation = rule.statutory
      ? `${rule.reason} Diese Daten müssen wir aufbewahren. Wir sperren sie und nutzen sie für nichts anderes.`
      : rule.onDeletionRequest === 'anonymize'
        ? `${rule.reason} Wir entfernen alles, was auf Sie zeigt.`
        : rule.reason;
    return {
      entity: rule.entity,
      action: rule.onDeletionRequest,
      effectiveAt: effective,
      explanation,
    };
  });
}

/** Datenexport nach Art. 20 DSGVO -- welche Tabellen gehoeren dazu? */
export const EXPORTABLE_ENTITIES = [
  'users',
  'support_seeker_profiles',
  'provider_profiles',
  'accessibility_preferences',
  'support_requests',
  'bookings',
  'messages',
  'reviews',
  'consents',
] as const;
