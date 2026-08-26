import type { CoarseRegion, IsoDateTime, SupportRequest } from '../domain/types';
import type { CommunicationMode } from '../domain/enums';
import { categoriesRequireProfessional, getCategory } from '../domain/service-categories';

/**
 * Der gefuehrte Ablauf "Wobei brauchst du Hilfe?".
 *
 * Ein Hauptschritt pro Ansicht. Jeder Schritt ist einzeln pruefbar, damit
 * Fehler direkt am Feld erklaert werden koennen und nicht erst am Ende.
 */
export const WIZARD_STEPS = [
  {
    key: 'what',
    title: 'Wobei brauchst du Hilfe?',
    formalTitle: 'Wobei brauchen Sie Hilfe?',
    help: 'Sie können mehrere Sachen auswählen.',
    dgsKey: 'request.step.what',
  },
  {
    key: 'when',
    title: 'Wann brauchst du Hilfe?',
    formalTitle: 'Wann brauchen Sie Hilfe?',
    help: 'Wählen Sie einen Tag und eine Uhrzeit.',
    dgsKey: 'request.step.when',
  },
  {
    key: 'where',
    title: 'Wo ungefähr?',
    formalTitle: 'Wo ungefähr?',
    help: 'Wir zeigen nie Ihre genaue Adresse. Nur Ihren Ort.',
    dgsKey: 'request.step.where',
  },
  {
    key: 'important',
    title: 'Was ist dir wichtig?',
    formalTitle: 'Was ist Ihnen wichtig?',
    help: 'Zum Beispiel: in Ruhe sprechen, Rollstuhl, Gebärdensprache.',
    dgsKey: 'request.step.important',
  },
  {
    key: 'summary',
    title: 'Stimmt alles?',
    formalTitle: 'Stimmt alles?',
    help: 'Bitte prüfen Sie Ihre Angaben. Danach können Sie absenden.',
    dgsKey: 'request.summary',
  },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]['key'];

export interface RequestDraft {
  id: string;
  seekerId: string;
  categoryKeys: string[];
  title: string;
  description: string;
  startsAt?: IsoDateTime;
  durationMinutes?: number;
  recurrence: 'once' | 'weekly' | 'biweekly' | 'monthly';
  recurrenceCount?: number;
  region?: CoarseRegion;
  importantToMe: string[];
  preferredCommunicationModes: CommunicationMode[];
  languages: string[];
  budgetCentsPerHour?: number | null;
  acceptsVolunteers: boolean;
  updatedAt: IsoDateTime;
}

export function createDraft(id: string, seekerId: string, now: IsoDateTime): RequestDraft {
  return {
    id,
    seekerId,
    categoryKeys: [],
    title: '',
    description: '',
    recurrence: 'once',
    importantToMe: [],
    preferredCommunicationModes: [],
    languages: ['Deutsch'],
    acceptsVolunteers: true,
    updatedAt: now,
  };
}

export interface FieldError {
  /** Feld, an dem der Hinweis erscheint -- nie eine Sammelmeldung oben. */
  field: string;
  /** Verstaendliche Erklaerung des Problems. */
  message: string;
  /** Konkreter Korrekturvorschlag. */
  howToFix: string;
}

export function validateStep(step: WizardStepKey, draft: RequestDraft, now: IsoDateTime): FieldError[] {
  const errors: FieldError[] = [];

  if (step === 'what') {
    if (draft.categoryKeys.length === 0) {
      errors.push({
        field: 'categoryKeys',
        message: 'Sie haben noch nicht ausgewählt, wobei Sie Hilfe brauchen.',
        howToFix: 'Tippen Sie auf mindestens eine Karte, zum Beispiel „Einkaufen“.',
      });
    }
    const unknown = draft.categoryKeys.filter((k) => !getCategory(k));
    if (unknown.length > 0) {
      errors.push({
        field: 'categoryKeys',
        message: `Unbekannte Auswahl: ${unknown.join(', ')}.`,
        howToFix: 'Bitte wählen Sie aus den angebotenen Karten.',
      });
    }
  }

  if (step === 'when') {
    if (!draft.startsAt) {
      errors.push({
        field: 'startsAt',
        message: 'Es fehlt noch der Tag und die Uhrzeit.',
        howToFix: 'Wählen Sie einen Tag im Kalender und danach eine Uhrzeit.',
      });
    } else if (new Date(draft.startsAt).getTime() <= new Date(now).getTime()) {
      errors.push({
        field: 'startsAt',
        message: 'Der gewählte Zeitpunkt liegt in der Vergangenheit.',
        howToFix: 'Bitte wählen Sie einen Tag, der noch kommt.',
      });
    }
    if (!draft.durationMinutes || draft.durationMinutes < 15) {
      errors.push({
        field: 'durationMinutes',
        message: 'Die Dauer fehlt oder ist zu kurz.',
        howToFix: 'Wählen Sie mindestens 15 Minuten.',
      });
    } else if (draft.durationMinutes > 12 * 60) {
      errors.push({
        field: 'durationMinutes',
        message: 'Ein Termin kann höchstens 12 Stunden dauern.',
        howToFix: 'Teilen Sie den Termin in mehrere Termine auf.',
      });
    }
    if (draft.recurrence !== 'once' && (draft.recurrenceCount ?? 0) < 2) {
      errors.push({
        field: 'recurrenceCount',
        message: 'Bei einer Wiederholung fehlt die Anzahl der Termine.',
        howToFix: 'Geben Sie an, wie oft der Termin stattfinden soll, mindestens zwei Mal.',
      });
    }
  }

  if (step === 'where') {
    if (!draft.region || !draft.region.city) {
      errors.push({
        field: 'region',
        message: 'Es fehlt noch der Ort.',
        howToFix: 'Geben Sie Ihren Ort ein oder tippen Sie auf „Meinen Ort verwenden“.',
      });
    } else if (!/^\d{2,3}$/.test(draft.region.postalPrefix)) {
      errors.push({
        field: 'region',
        message: 'Die Postleitzahl-Angabe ist unvollständig.',
        howToFix: 'Wir brauchen nur die ersten Ziffern Ihrer Postleitzahl.',
      });
    }
  }

  if (step === 'summary') {
    for (const s of ['what', 'when', 'where'] as const) {
      errors.push(...validateStep(s, draft, now));
    }
  }

  return errors;
}

export function canGoToNextStep(step: WizardStepKey, draft: RequestDraft, now: IsoDateTime): boolean {
  return validateStep(step, draft, now).length === 0;
}

/** Fortschritt sichtbar machen -- Schritt x von y. */
export function stepProgress(step: WizardStepKey): { index: number; total: number } {
  const index = WIZARD_STEPS.findIndex((s) => s.key === step);
  return { index: index + 1, total: WIZARD_STEPS.length };
}

export class DraftIncompleteError extends Error {
  constructor(public readonly errors: FieldError[]) {
    super('Der Entwurf ist noch nicht vollständig.');
    this.name = 'DraftIncompleteError';
  }
}

/**
 * Macht aus dem Entwurf eine echte Anfrage.
 * `requiresLicensedProfessional` wird abgeleitet, nie von aussen gesetzt --
 * so kann niemand eine pflegerische Anfrage als Alltagshilfe tarnen.
 */
export function finalizeDraft(draft: RequestDraft, now: IsoDateTime): SupportRequest {
  const errors = validateStep('summary', draft, now);
  if (errors.length > 0) throw new DraftIncompleteError(errors);

  const categoryLabels = draft.categoryKeys.map((k) => getCategory(k)?.label ?? k);

  return {
    id: draft.id,
    seekerId: draft.seekerId,
    status: 'open',
    categoryKeys: [...draft.categoryKeys],
    title: draft.title.trim() || `Unterstützung: ${categoryLabels.join(', ')}`,
    description: draft.description.trim(),
    importantToMe: [...draft.importantToMe],
    region: draft.region!,
    startsAt: draft.startsAt!,
    durationMinutes: draft.durationMinutes!,
    recurrence: draft.recurrence,
    ...(draft.recurrenceCount != null ? { recurrenceCount: draft.recurrenceCount } : {}),
    requiresLicensedProfessional: categoriesRequireProfessional(draft.categoryKeys),
    preferredCommunicationModes: [...draft.preferredCommunicationModes],
    languages: [...draft.languages],
    budgetCentsPerHour: draft.budgetCentsPerHour ?? null,
    acceptsVolunteers: draft.acceptsVolunteers,
    createdAt: now,
    updatedAt: now,
  };
}

/** Wiederkehrende Termine als konkrete Zeitpunkte. */
export function expandRecurrence(request: SupportRequest): IsoDateTime[] {
  if (request.recurrence === 'once') return [request.startsAt];
  const count = Math.max(1, request.recurrenceCount ?? 1);
  const stepDays = request.recurrence === 'weekly' ? 7 : request.recurrence === 'biweekly' ? 14 : 0;
  const dates: IsoDateTime[] = [];
  const start = new Date(request.startsAt);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    if (stepDays > 0) {
      d.setUTCDate(d.getUTCDate() + i * stepDays);
    } else {
      d.setUTCMonth(d.getUTCMonth() + i);
    }
    dates.push(d.toISOString());
  }
  return dates;
}
