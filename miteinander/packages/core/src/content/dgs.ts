import type { DgsContentItem } from '../domain/types';
import type { ContentReviewStatus } from '../domain/enums';
import {
  DGS_SKRIPTE,
  DGS_TITEL,
  REQUIRED_DGS_KEYS,
  SEKUNDEN_PRO_SATZ,
  type RequiredDgsKey,
} from './dgs-skripte';

export { REQUIRED_DGS_KEYS, type RequiredDgsKey };
import { transkriptAusZeilen, zeilenAusSaetzen, type Untertitelzeile } from './untertitel';

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

/**
 * Der ausgelieferte Katalog.
 *
 * Transkript und Untertitel sind echte Inhalte und ab sofort nutzbar --
 * fuer gehoerlose Menschen ist ein vollstaendiger Text mehr wert als gar
 * nichts. Der Status bleibt trotzdem "placeholder": ein Video in
 * Deutscher Gebaerdensprache ist damit NICHT ersetzt. DGS ist eine eigene
 * Sprache mit eigener Grammatik, kein verschriftetes Deutsch.
 */
export const DGS_CATALOG: DgsContentItem[] = REQUIRED_DGS_KEYS.map((key) => {
  const untertitel = zeilenAusSaetzen(DGS_SKRIPTE[key], SEKUNDEN_PRO_SATZ);
  return {
    key,
    title: DGS_TITEL[key],
    status: 'placeholder' as ContentReviewStatus,
    videoUrl: null,
    captionsUrl: null,
    untertitel,
    transcript: transkriptAusZeilen(untertitel),
    reviewedBy: null,
    reviewedAt: null,
    version: 0,
  };
});

/** Laufzeit eines Eintrags in Sekunden -- ergibt sich aus den Untertiteln. */
export function laufzeit(item: DgsContentItem): number {
  return item.untertitel.reduce((max, z) => Math.max(max, z.bis), 0);
}

export class DgsRegistry {
  private items = new Map<string, DgsContentItem>();

  constructor(items: readonly DgsContentItem[] = DGS_CATALOG) {
    for (const item of items) this.items.set(item.key, { ...item });
  }

  get(key: string): DgsContentItem | undefined {
    return this.items.get(key);
  }

  /** Neue Fassung einspielen. Ein neues Video setzt die Pruefung zurueck. */
  upsertVideo(
    key: string,
    videoUrl: string,
    captionsUrl: string,
    transcript: string,
    untertitel: Untertitelzeile[] = [],
  ): DgsContentItem {
    const existing = this.items.get(key);
    const next: DgsContentItem = {
      key,
      title: existing?.title ?? key,
      status: 'in_review',
      videoUrl,
      captionsUrl,
      untertitel: untertitel.length > 0 ? untertitel : (existing?.untertitel ?? []),
      transcript,
      reviewedBy: null,
      reviewedAt: null,
      version: (existing?.version ?? 0) + 1,
    };
    this.items.set(key, next);
    return next;
  }

  /**
   * Hinterlegt ein gekennzeichnetes Platzhaltervideo.
   *
   * Anders als upsertVideo aendert das den Status NICHT: der Eintrag bleibt
   * ein Platzhalter. Zweck ist allein, dass der Abspieler mit Untertiteln,
   * Geschwindigkeit und Vollbild vollstaendig bedienbar ist, bevor die
   * echten Aufnahmen vorliegen.
   */
  setzePlatzhalterVideo(key: string, videoUrl: string): DgsContentItem | undefined {
    const item = this.items.get(key);
    if (!item) return undefined;
    if (item.status === 'approved') return item;
    const next: DgsContentItem = { ...item, videoUrl, status: 'placeholder' };
    this.items.set(key, next);
    return next;
  }

  /** Freigabe nur mit Namen der pruefenden Person. */
  approve(key: string, reviewedBy: string, reviewedAt: string): DgsContentItem {
    const item = this.items.get(key);
    if (!item) throw new Error(`Unbekannter DGS-Inhalt: ${key}`);
    if (!item.videoUrl) throw new Error('Ohne produziertes Video ist keine Freigabe möglich.');
    if (item.untertitel.length === 0 || !item.transcript) {
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
