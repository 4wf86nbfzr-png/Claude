import type { DgsContentItem } from '../domain/types';
import type { ContentReviewStatus } from '../domain/enums';

/**
 * DGS-Inhalte (Deutsche Gebaerdensprache).
 *
 * Ehrlichkeitsregel: Ein Eintrag gilt nur dann als geprueft, wenn ein Video
 * vorliegt UND eine namentlich benannte Person es geprueft hat. Bis dahin ist
 * der Status "placeholder" -- und die Oberflaeche sagt das auch.
 *
 * Eine automatische Uebersetzung ist NIE eine gueltige Quelle. Sie kann nicht
 * Grundlage fuer Vertraege, Buchungen, Sicherheit oder Einwilligungen sein.
 */

/** Kernablaeufe, fuer die DGS-Videos zwingend produziert werden muessen. */
export const REQUIRED_DGS_KEYS = [
  'onboarding.welcome',
  'onboarding.mode_choice',
  'onboarding.accessibility',
  'profile.create',
  'search.overview',
  'request.step.what',
  'request.step.when',
  'request.step.where',
  'request.step.important',
  'request.summary',
  'provider.profile_explained',
  'booking.summary',
  'booking.cancellation',
  'payment.overview',
  'complaint.how_to',
  'safety.emergency',
  'privacy.overview',
  'help.overview',
] as const;
export type RequiredDgsKey = (typeof REQUIRED_DGS_KEYS)[number];

const TITLES: Record<RequiredDgsKey, string> = {
  'onboarding.welcome': 'Willkommen',
  'onboarding.mode_choice': 'Was möchten Sie tun?',
  'onboarding.accessibility': 'Bedienung einstellen',
  'profile.create': 'Ihr Profil anlegen',
  'search.overview': 'So finden Sie Unterstützung',
  'request.step.what': 'Wobei brauchen Sie Hilfe?',
  'request.step.when': 'Wann brauchen Sie Hilfe?',
  'request.step.where': 'Wo ungefähr?',
  'request.step.important': 'Was ist Ihnen wichtig?',
  'request.summary': 'Ihre Anfrage im Überblick',
  'provider.profile_explained': 'Das Profil verstehen',
  'booking.summary': 'Ihre Buchung im Überblick',
  'booking.cancellation': 'Einen Termin absagen',
  'payment.overview': 'Bezahlen',
  'complaint.how_to': 'Sich beschweren',
  'safety.emergency': 'Notfall und Sicherheit',
  'privacy.overview': 'Ihre Daten',
  'help.overview': 'Hilfe',
};

/**
 * Der ausgelieferte Katalog. Im Entwicklungsstand sind alle Eintraege
 * gekennzeichnete Platzhalter -- das ist Absicht und wird sichtbar gemacht.
 */
export const DGS_CATALOG: DgsContentItem[] = REQUIRED_DGS_KEYS.map((key) => ({
  key,
  title: TITLES[key],
  status: 'placeholder' as ContentReviewStatus,
  videoUrl: null,
  captionsUrl: null,
  transcript: null,
  reviewedBy: null,
  reviewedAt: null,
  version: 0,
}));

export class DgsRegistry {
  private items = new Map<string, DgsContentItem>();

  constructor(items: readonly DgsContentItem[] = DGS_CATALOG) {
    for (const item of items) this.items.set(item.key, { ...item });
  }

  get(key: string): DgsContentItem | undefined {
    return this.items.get(key);
  }

  /** Neue Fassung einspielen. Ein neues Video setzt die Pruefung zurueck. */
  upsertVideo(key: string, videoUrl: string, captionsUrl: string, transcript: string): DgsContentItem {
    const existing = this.items.get(key);
    const next: DgsContentItem = {
      key,
      title: existing?.title ?? key,
      status: 'in_review',
      videoUrl,
      captionsUrl,
      transcript,
      reviewedBy: null,
      reviewedAt: null,
      version: (existing?.version ?? 0) + 1,
    };
    this.items.set(key, next);
    return next;
  }

  /** Freigabe nur mit Namen der pruefenden Person. */
  approve(key: string, reviewedBy: string, reviewedAt: string): DgsContentItem {
    const item = this.items.get(key);
    if (!item) throw new Error(`Unbekannter DGS-Inhalt: ${key}`);
    if (!item.videoUrl) throw new Error('Ohne produziertes Video ist keine Freigabe möglich.');
    if (!item.captionsUrl || !item.transcript) {
      throw new Error('Ein DGS-Video braucht Untertitel und ein Transkript.');
    }
    if (!reviewedBy.trim()) {
      throw new Error('Die Freigabe braucht den Namen der prüfenden Person.');
    }
    const next: DgsContentItem = { ...item, status: 'approved', reviewedBy, reviewedAt };
    this.items.set(key, next);
    return next;
  }

  isApproved(key: string): boolean {
    const item = this.items.get(key);
    return item?.status === 'approved' && !!item.videoUrl && !!item.reviewedBy;
  }

  /** Was noch fehlt -- Grundlage fuer die Produktionsliste und LAUNCH_CHECKLIST. */
  missing(): DgsContentItem[] {
    return REQUIRED_DGS_KEYS.map((key) => this.items.get(key)).filter(
      (item): item is DgsContentItem => item !== undefined && item.status !== 'approved',
    );
  }

  /** Abdeckungsgrad. Wird im Adminbereich angezeigt, nie geschoent. */
  coverage(): { approved: number; total: number; ratio: number } {
    const total = REQUIRED_DGS_KEYS.length;
    const approved = REQUIRED_DGS_KEYS.filter((k) => this.isApproved(k)).length;
    return { approved, total, ratio: approved / total };
  }

  all(): DgsContentItem[] {
    return [...this.items.values()];
  }
}

/** Text, den die Oberflaeche zeigt, solange ein Video fehlt. Keine Beschoenigung. */
export function dgsStatusNotice(item: DgsContentItem | undefined): string | null {
  if (!item || item.status === 'approved') return null;
  switch (item?.status) {
    case 'placeholder':
      return 'Für diesen Bereich gibt es noch kein Video in Gebärdensprache. Es wird gerade produziert.';
    case 'in_review':
    case 'draft':
      return 'Das Video in Gebärdensprache wird noch fachlich geprüft.';
    case 'outdated':
      return 'Das Video in Gebärdensprache ist nicht mehr aktuell und wird neu aufgenommen.';
    default:
      return 'Für diesen Bereich gibt es noch kein geprüftes Video in Gebärdensprache.';
  }
}

/** Anforderungen an die Produktion. Gehen als Briefing an das Filmteam. */
export const DGS_PRODUCTION_REQUIREMENTS = [
  'Gebärdende Person ist DGS-Muttersprachler:in oder qualifizierte Fachkraft.',
  'Ruhiger, kontrastreicher Hintergrund ohne Muster.',
  'Gleichmäßige Ausleuchtung, Hände und Gesicht immer vollständig im Bild.',
  'Untertitel in deutscher Schriftsprache sowie vollständiges Transkript.',
  'Wiedergabe steuerbar: Pause, zurückspringen, Geschwindigkeit, Vollbild.',
  'Fachliche Prüfung durch eine zweite, namentlich dokumentierte Person.',
] as const;
