import { describe, expect, it } from 'vitest';
import {
  DraftIncompleteError,
  WIZARD_STEPS,
  canGoToNextStep,
  createDraft,
  expandRecurrence,
  finalizeDraft,
  stepProgress,
  validateStep,
} from '../src/requests/wizard';

const NOW = '2026-03-02T09:00:00.000Z';

function vollstaendig() {
  return {
    ...createDraft('req_1', 'u_seeker_1', NOW),
    categoryKeys: ['einkaufen'],
    startsAt: '2026-03-04T10:00:00.000Z',
    durationMinutes: 60,
    region: { postalPrefix: '221', city: 'Hamburg', approxLat: 53.55, approxLon: 9.99 },
    importantToMe: ['In Ruhe sprechen'],
  };
}

describe('Ablauf der Anfrage', () => {
  it('hat pro Ansicht genau eine Hauptaufgabe', () => {
    expect(WIZARD_STEPS.map((s) => s.key)).toEqual(['what', 'when', 'where', 'important', 'summary']);
    for (const step of WIZARD_STEPS) {
      expect(step.help.length).toBeGreaterThan(10);
      expect(step.dgsKey.length).toBeGreaterThan(0);
    }
  });

  it('zeigt den Fortschritt an', () => {
    expect(stepProgress('what')).toEqual({ index: 1, total: 5 });
    expect(stepProgress('summary')).toEqual({ index: 5, total: 5 });
  });
});

describe('Fehler direkt am Feld', () => {
  it('erklärt eine fehlende Auswahl und sagt, was zu tun ist', () => {
    const errors = validateStep('what', createDraft('r', 'u', NOW), NOW);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe('categoryKeys');
    expect(errors[0]?.howToFix).toContain('Karte');
  });

  it('weist einen Termin in der Vergangenheit zurück', () => {
    const draft = { ...vollstaendig(), startsAt: '2020-01-01T10:00:00.000Z' };
    const errors = validateStep('when', draft, NOW);
    expect(errors.some((e) => e.message.includes('Vergangenheit'))).toBe(true);
  });

  it('weist eine unsinnige Dauer zurück', () => {
    expect(validateStep('when', { ...vollstaendig(), durationMinutes: 5 }, NOW)).toHaveLength(1);
    expect(validateStep('when', { ...vollstaendig(), durationMinutes: 900 }, NOW)).toHaveLength(1);
  });

  it('verlangt bei einer Wiederholung die Anzahl', () => {
    const draft = { ...vollstaendig(), recurrence: 'weekly' as const };
    const errors = validateStep('when', draft, NOW);
    expect(errors.some((e) => e.field === 'recurrenceCount')).toBe(true);
  });

  it('braucht nur die ersten Ziffern der Postleitzahl', () => {
    const draft = { ...vollstaendig(), region: { postalPrefix: '', city: 'Hamburg', approxLat: 0, approxLon: 0 } };
    expect(validateStep('where', draft, NOW).some((e) => e.field === 'region')).toBe(true);
  });

  it('lässt den Schritt frei, wenn alles stimmt', () => {
    expect(canGoToNextStep('what', vollstaendig(), NOW)).toBe(true);
    expect(canGoToNextStep('when', vollstaendig(), NOW)).toBe(true);
    expect(canGoToNextStep('where', vollstaendig(), NOW)).toBe(true);
  });
});

describe('Abschluss', () => {
  it('leitet die Erlaubnispflicht aus den Kategorien ab und lässt sie nicht setzen', () => {
    const request = finalizeDraft(
      { ...vollstaendig(), categoryKeys: ['pflegerische_unterstuetzung'] },
      NOW,
    );
    expect(request.requiresLicensedProfessional).toBe(true);

    const harmlos = finalizeDraft(vollstaendig(), NOW);
    expect(harmlos.requiresLicensedProfessional).toBe(false);
  });

  it('setzt einen verständlichen Titel, wenn keiner eingegeben wurde', () => {
    const request = finalizeDraft(vollstaendig(), NOW);
    expect(request.title).toContain('Einkaufen');
  });

  it('bricht mit allen Feldfehlern ab, statt halb zu speichern', () => {
    try {
      finalizeDraft(createDraft('r', 'u', NOW), NOW);
      expect.unreachable('hätte werfen müssen');
    } catch (error) {
      expect(error).toBeInstanceOf(DraftIncompleteError);
      expect((error as DraftIncompleteError).errors.length).toBeGreaterThan(1);
    }
  });

  it('rechnet wiederkehrende Termine aus', () => {
    const request = finalizeDraft(
      { ...vollstaendig(), recurrence: 'weekly', recurrenceCount: 3 },
      NOW,
    );
    const termine = expandRecurrence(request);
    expect(termine).toHaveLength(3);
    expect(termine[1]).toBe('2026-03-11T10:00:00.000Z');
    expect(termine[2]).toBe('2026-03-18T10:00:00.000Z');
  });
});
