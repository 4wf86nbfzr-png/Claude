import type { IsoDate, Match, MatchReason, SupportRequest } from '../domain/types';
import { getCategory } from '../domain/service-categories';
import { COMMUNICATION_MODE_LABELS, PROVIDER_KIND_LABELS } from '../domain/enums';
import { checkEligibility, type ProviderRecord } from './eligibility';
import { coarseDistanceLabel } from './geo';
import { assertNoProtectedSignal, evaluatePreference, type PreferenceInput } from './fairness';

/**
 * Gewichtung der Bewertungskomponenten.
 *
 * Bewusst offengelegt und im Produkt erklaerbar: es gibt keine geheime
 * Rangfolge. Die Schluessel duerfen kein geschuetztes Merkmal enthalten --
 * das prueft `assertNoProtectedSignal` (siehe Test).
 */
export const SCORE_WEIGHTS = {
  leistung: 30,
  qualifikation: 20,
  verfuegbarkeit: 12,
  naehe: 14,
  barrierefreiheitskompetenz: 14,
  kommunikationsform: 10,
} as const;

export type ScoreSignal = keyof typeof SCORE_WEIGHTS;

export interface MatchOptions {
  today: IsoDate;
  /** Freiwillige Praeferenzen. Werden nur nach Fairness-Pruefung wirksam. */
  preferences?: PreferenceInput[];
  /** Hoechstzahl der Vorschlaege. */
  limit?: number;
}

export interface ScoredProvider extends Match {
  distanceLabel: string;
  components: Record<ScoreSignal, number>;
}

/** Bewertet einen einzelnen Anbietenden gegen eine Anfrage. */
export function scoreProvider(
  request: SupportRequest,
  provider: ProviderRecord,
  distance: number,
): { total: number; components: Record<ScoreSignal, number>; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  const components = {
    leistung: 0,
    qualifikation: 0,
    verfuegbarkeit: 0,
    naehe: 0,
    barrierefreiheitskompetenz: 0,
    kommunikationsform: 0,
  } satisfies Record<ScoreSignal, number>;

  // 1. Leistung: wie viele der gewuenschten Kategorien werden abgedeckt?
  const offered = new Set(provider.services.map((s) => s.categoryKey));
  const matchedCategories = request.categoryKeys.filter((k) => offered.has(k));
  const coverage = request.categoryKeys.length
    ? matchedCategories.length / request.categoryKeys.length
    : 0;
  components.leistung = SCORE_WEIGHTS.leistung * coverage;
  if (matchedCategories.length > 0) {
    const labels = matchedCategories.map((k) => getCategory(k)?.label ?? k);
    reasons.push({
      code: 'leistung',
      text: `Bietet an: ${labels.join(', ')}.`,
      easyText: `Diese Person kann helfen bei: ${labels.join(', ')}.`,
    });
  }

  // 2. Qualifikation: Erfahrung in genau diesen Kategorien plus geprüfte Rolle.
  const years = provider.services
    .filter((s) => matchedCategories.includes(s.categoryKey))
    .reduce((max, s) => Math.max(max, s.experienceYears), 0);
  const experienceFactor = Math.min(1, years / 5);
  const kindFactor =
    provider.profile.kind === 'professional' ? 1 : provider.profile.kind === 'qualified_companion' ? 0.75 : 0.5;
  components.qualifikation = SCORE_WEIGHTS.qualifikation * (0.6 * kindFactor + 0.4 * experienceFactor);
  reasons.push({
    code: 'qualifikation',
    text: `${PROVIDER_KIND_LABELS[provider.profile.kind]}${years > 0 ? `, ${years} Jahre Erfahrung` : ''}.`,
    easyText: `Diese Person ist: ${PROVIDER_KIND_LABELS[provider.profile.kind]}.`,
  });

  // 3. Verfuegbarkeit -- die harte Pruefung ist bereits erfolgt, hier zaehlt Spielraum.
  const slotBreadth = Math.min(1, provider.availability.length / 6);
  components.verfuegbarkeit = SCORE_WEIGHTS.verfuegbarkeit * (0.6 + 0.4 * slotBreadth);
  reasons.push({
    code: 'verfuegbarkeit',
    text: 'Hat zu Ihrem Wunschtermin Zeit.',
    easyText: 'Diese Person hat an Ihrem Termin Zeit.',
  });

  // 4. Naehe -- nur grob, nie metergenau.
  const proximity = Math.max(0, 1 - distance / Math.max(1, provider.profile.radiusKm));
  components.naehe = SCORE_WEIGHTS.naehe * proximity;
  reasons.push({
    code: 'naehe',
    text: `Einsatzgebiet passt: ${coarseDistanceLabel(distance)}.`,
    easyText: `Diese Person ist ${coarseDistanceLabel(distance)}.`,
  });

  // 5. Barrierefreiheitskompetenz -- deckt sie die genannten Bedarfe ab?
  const needed = new Set(request.importantToMe.map(normalize));
  const skills = provider.profile.accessibilitySkills.map(normalize);
  const covered = [...needed].filter((n) => skills.some((s) => s.includes(n) || n.includes(s)));
  const skillFactor = needed.size === 0 ? 0.5 : covered.length / needed.size;
  components.barrierefreiheitskompetenz = SCORE_WEIGHTS.barrierefreiheitskompetenz * skillFactor;
  if (covered.length > 0) {
    reasons.push({
      code: 'barrierefreiheitskompetenz',
      text: `Kennt sich aus mit: ${provider.profile.accessibilitySkills.join(', ')}.`,
      easyText: 'Diese Person weiß, was Ihnen wichtig ist.',
    });
  }

  // 6. Kommunikationsform.
  const wanted = request.preferredCommunicationModes;
  const shared = wanted.filter((m) => provider.profile.communicationModes.includes(m));
  const commFactor = wanted.length === 0 ? 0.5 : shared.length / wanted.length;
  components.kommunikationsform = SCORE_WEIGHTS.kommunikationsform * commFactor;
  if (shared.length > 0) {
    reasons.push({
      code: 'kommunikationsform',
      text: `Kommuniziert per ${shared.map((m) => COMMUNICATION_MODE_LABELS[m]).join(', ')}.`,
      easyText: `Sie können sich verständigen: ${shared.map((m) => COMMUNICATION_MODE_LABELS[m]).join(', ')}.`,
    });
  }
  if (
    wanted.includes('dgs') &&
    provider.profile.communicationModes.includes('dgs') &&
    !provider.profile.signLanguageVerified
  ) {
    reasons.push({
      code: 'dgs_ungeprueft',
      text: 'Gebärdensprache ist eigene Angabe und noch nicht durch einen Nachweis geprüft.',
      easyText: 'Die Angabe zur Gebärdensprache ist noch nicht geprüft.',
    });
  }

  const total = Object.values(components).reduce((a, b) => a + b, 0);
  return { total: Math.round(total * 10) / 10, components, reasons };
}

/**
 * Erstellt die Vorschlagsliste zu einer Anfrage.
 * Reihenfolge: erst harte Ausschlusskriterien, dann Bewertung, dann Rangfolge.
 */
export function findMatches(
  request: SupportRequest,
  providers: readonly ProviderRecord[],
  options: MatchOptions,
): ScoredProvider[] {
  assertNoProtectedSignal(Object.keys(SCORE_WEIGHTS));

  const preferenceDecisions = (options.preferences ?? []).map((p) => ({
    input: p,
    decision: evaluatePreference(p),
  }));
  const needsManualReview = preferenceDecisions.some((p) => p.decision.needsManualReview);
  const manualReviewReason = preferenceDecisions.find((p) => p.decision.needsManualReview)?.decision.reason;

  const results: ScoredProvider[] = [];
  for (const provider of providers) {
    const eligibility = checkEligibility(request, provider, options.today);
    if (!eligibility.eligible) continue;

    const { total, components, reasons } = scoreProvider(request, provider, eligibility.distanceKm);
    results.push({
      requestId: request.id,
      providerId: provider.profile.userId,
      score: total,
      reasons,
      distanceLabel: coarseDistanceLabel(eligibility.distanceKm),
      components,
      needsManualReview,
      ...(manualReviewReason ? { manualReviewReason } : {}),
    });
  }

  results.sort((a, b) => b.score - a.score || a.providerId.localeCompare(b.providerId));
  return typeof options.limit === 'number' ? results.slice(0, options.limit) : results;
}

/** Vergleich von bis zu drei Vorschlaegen -- Screen 8. */
export interface ComparisonRow {
  label: string;
  values: string[];
}

export function buildComparison(
  matches: readonly ScoredProvider[],
  providers: readonly ProviderRecord[],
): { headers: string[]; rows: ComparisonRow[] } {
  const picked = matches.slice(0, 3);
  const byId = new Map(providers.map((p) => [p.profile.userId, p]));
  const records = picked
    .map((m) => byId.get(m.providerId))
    .filter((p): p is ProviderRecord => p !== undefined);

  const headers = records.map((p) => p.profile.headline);
  const rows: ComparisonRow[] = [
    { label: 'Rolle', values: records.map((p) => PROVIDER_KIND_LABELS[p.profile.kind]) },
    {
      label: 'Preis',
      values: records.map((p) =>
        p.profile.volunteer
          ? 'ehrenamtlich, kostenlos'
          : p.profile.hourlyRateCents != null
            ? `${(p.profile.hourlyRateCents / 100).toFixed(2).replace('.', ',')} Euro pro Stunde`
            : 'auf Anfrage',
      ),
    },
    { label: 'Entfernung', values: picked.map((m) => m.distanceLabel) },
    {
      label: 'Verständigung',
      values: records.map((p) =>
        p.profile.communicationModes.map((m) => COMMUNICATION_MODE_LABELS[m]).join(', '),
      ),
    },
    { label: 'Sprachen', values: records.map((p) => p.profile.languages.join(', ')) },
    {
      label: 'Macht ausdrücklich nicht',
      values: records.map((p) => p.profile.explicitlyNotOffered.join(', ') || 'keine Angabe'),
    },
    { label: 'Absage-Regel', values: records.map((p) => p.profile.cancellationPolicy) },
    {
      label: 'Bewertungen',
      values: records.map((p) =>
        p.reviewCount && p.averageRating
          ? `${p.averageRating.toFixed(1)} von 3 bei ${p.reviewCount} Rückmeldungen`
          : 'noch keine Rückmeldungen',
      ),
    },
  ];
  return { headers, rows };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}
