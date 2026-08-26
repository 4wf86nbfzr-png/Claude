import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryContext } from '../src/data/memory/memory-context';
import { fixedClock, type DataContext } from '../src/data/repositories';
import { SupportService, ServiceError, createCounterIds } from '../src/services/support-service';
import { createDraft } from '../src/requests/wizard';
import { demoSeed } from '../src/seed/demo-data';
import { redactSeekerProfile } from '../src/privacy/visibility';
import { grantConsent } from '../src/privacy/consent';

/**
 * Durchgehender Ablauf gemaess Definition of Done:
 * Anfrage stellen -> Vorschlag verstehen -> Kontakt aufnehmen -> Buchung mit
 * klarer Bestaetigung -> Termin abschliessen -> bewerten.
 */

const NOW = '2026-03-02T09:00:00.000Z';

let data: DataContext;
let service: SupportService;

beforeEach(() => {
  data = createMemoryContext(demoSeed);
  service = new SupportService(data, fixedClock(NOW), createCounterIds());
});

function draft() {
  return {
    ...createDraft('req_flow', 'u_seeker_1', NOW),
    categoryKeys: ['begleitung_termine'],
    startsAt: '2026-03-04T10:00:00.000Z',
    durationMinutes: 90,
    region: { postalPrefix: '221', city: 'Hamburg', approxLat: 53.55, approxLon: 9.99 },
    importantToMe: ['Rollator'],
    preferredCommunicationModes: ['sprechen' as const],
  };
}

describe('Durchgehender Ablauf für eine unterstützungssuchende Person', () => {
  it('führt von der Anfrage bis zur bestätigten Buchung', async () => {
    const request = await service.submitRequest(draft());
    expect(request.status).toBe('open');

    // 1. Vorschläge mit nachvollziehbaren Gründen
    const suggestions = await service.suggestProviders(request.id);
    expect(suggestions.length).toBeGreaterThan(0);
    const top = suggestions[0]!;
    expect(top.providerName).toBe('Meike (Demo)');
    expect(top.reasons.length).toBeGreaterThan(2);
    expect(top.easyReasons.length).toBe(top.reasons.length);
    expect(top.distanceLabel).not.toMatch(/\d+\.\d+/); // nie metergenau

    // 2. Kontakt aufnehmen
    const conversation = await service.startConversation(request.id, top.match.providerId);
    await service.sendMessage(conversation.id, 'u_seeker_1', 'text', 'Moin, passt Mittwoch um zehn?');
    const messages = await data.conversations.messages(conversation.id);
    expect(messages).toHaveLength(1);

    // 3. Buchung vorschlagen -- mit Pflicht-Zusammenfassung
    const { booking, summary } = await service.proposeBooking({
      requestId: request.id,
      providerId: top.match.providerId,
      startsAt: '2026-03-04T10:00:00.000Z',
      durationMinutes: 90,
      meetingPointDescription: 'Vor dem Eingang des Bürgeramts Hamburg-Mitte',
      priceCents: 4200,
    });
    expect(booking.status).toBe('proposed');
    expect(summary.requiresExplicitConfirmation).toBe(true);
    expect(summary.easyText.length).toBeGreaterThan(0);
    expect(summary.speechText.length).toBeGreaterThan(0);

    // 4. Zwei aktive Bestätigungen machen die Buchung verbindlich
    // Frau Kessler hat eine Begleitung, aber keine Freigabepflicht --
    // sie entscheidet selbst.
    const ersteBestaetigung = await service.confirmBooking(booking.id, 'u_seeker_1');
    expect(ersteBestaetigung.approval).toBeUndefined();
    expect(ersteBestaetigung.booking.status).toBe('proposed');
    const zweiteBestaetigung = await service.confirmBooking(booking.id, top.match.providerId);
    expect(zweiteBestaetigung.booking.status).toBe('confirmed');
    expect(zweiteBestaetigung.booking.preciseAddressReleased).toBe(true);

    // Die Anfrage ist jetzt gebucht.
    expect((await data.requests.get(request.id))?.status).toBe('booked');

    // 5. Termin durchführen und bewerten
    const completed = await service.completeBooking(booking.id, top.match.providerId);
    expect(completed.status).toBe('completed');

    const review = await service.submitReview({
      bookingId: booking.id,
      authorId: 'u_seeker_1',
      rating: 3,
      publicComment: 'Hat alles vorher erklärt.',
      privateFeedback: 'Nur für das Sicherheitsteam: alles gut.',
    });
    expect(review.subjectId).toBe(top.match.providerId);
    expect(review.privateFeedback).not.toBeNull();
  });

  it('hält die Kontaktdaten bis zur bestätigten Buchung zurück', async () => {
    const request = await service.submitRequest(draft());
    const preview = await service.requestPreviewForProvider(request.id);
    expect(preview.seeker.phone).toBeUndefined();
    expect(preview.seeker.preciseAddress).toBeUndefined();
    expect(preview.regionLabel).toContain('Hamburg');
    expect(preview.categoryLabels).toContain('Begleitung zu Terminen');
  });

  it('verlangt vor der Bestätigung eine Freigabe der Kontaktdaten', async () => {
    // Diese Person hat die Kontaktfreigabe nicht erteilt.
    const ohneFreigabe = createMemoryContext({
      ...demoSeed,
      consents: (demoSeed.consents ?? []).filter(
        (c) => !(c.userId === 'u_seeker_1' && c.purpose === 'contact_release'),
      ),
    });
    const s = new SupportService(ohneFreigabe, fixedClock(NOW), createCounterIds());
    const request = await s.submitRequest(draft());
    const { booking } = await s.proposeBooking({
      requestId: request.id,
      providerId: 'u_provider_1',
      startsAt: '2026-03-04T10:00:00.000Z',
      durationMinutes: 90,
      meetingPointDescription: 'Vor dem Eingang',
      priceCents: 4200,
    });
    await expect(s.confirmBooking(booking.id, 'u_seeker_1')).rejects.toThrow(/Kontaktdaten/);
  });

  it('lehnt eine Anfrage mit sensiblen Angaben ohne Einwilligung klar ab', async () => {
    const ohneEinwilligung = createMemoryContext({
      ...demoSeed,
      consents: (demoSeed.consents ?? []).filter(
        (c) => !(c.userId === 'u_seeker_1' && c.purpose === 'sensitive_support_needs'),
      ),
    });
    const s = new SupportService(ohneEinwilligung, fixedClock(NOW), createCounterIds());
    await expect(s.submitRequest(draft())).rejects.toThrow(ServiceError);
    await expect(s.submitRequest(draft())).rejects.toThrow(/Einwilligung/);
  });

  it('sagt vor einer Absage ehrlich, was sie kostet', async () => {
    const request = await service.submitRequest(draft());
    const { booking } = await service.proposeBooking({
      requestId: request.id,
      providerId: 'u_provider_1',
      startsAt: '2026-03-04T10:00:00.000Z',
      durationMinutes: 90,
      meetingPointDescription: 'Vor dem Eingang',
      priceCents: 4200,
    });
    const preview = await service.previewCancellation(booking.id);
    expect(preview.allowed).toBe(true);
    expect(preview.feeCents).toBe(0); // mehr als 24 Stunden vorher
  });
});

describe('Nachrichten', () => {
  it('verlangt zu jeder Sprachnachricht ein sichtbares Transkript', async () => {
    const request = await service.submitRequest(draft());
    const conversation = await service.startConversation(request.id, 'u_provider_1');
    await expect(
      service.sendMessage(conversation.id, 'u_seeker_1', 'voice', '', { mediaPath: 'a.m4a' }),
    ).rejects.toThrow(/Transkript/);

    const ok = await service.sendMessage(conversation.id, 'u_seeker_1', 'voice', '', {
      mediaPath: 'a.m4a',
      transcript: 'Moin, passt Mittwoch?',
    });
    expect(ok.transcript).toBe('Moin, passt Mittwoch?');
  });

  it('lässt Unbeteiligte nicht mitschreiben', async () => {
    const request = await service.submitRequest(draft());
    const conversation = await service.startConversation(request.id, 'u_provider_1');
    await expect(
      service.sendMessage(conversation.id, 'u_provider_2', 'text', 'Hallo'),
    ).rejects.toThrow(/Kein Zugriff/);
  });
});

describe('Benachrichtigungen und Protokoll', () => {
  it('sendet keine Inhalte in der Vorschau', async () => {
    const request = await service.submitRequest(draft());
    const conversation = await service.startConversation(request.id, 'u_provider_1');
    await service.sendMessage(conversation.id, 'u_seeker_1', 'text', 'Sehr persönlicher Inhalt');
    const notifications = await data.notifications.forUser('u_provider_1');
    expect(notifications.length).toBeGreaterThan(0);
    for (const n of notifications) {
      expect(n.body).not.toContain('persönlicher Inhalt');
    }
  });

  it('protokolliert Vorgänge ohne sensible Inhalte', async () => {
    const request = await service.submitRequest(draft());
    const events = await data.audit.list();
    const submitted = events.find((e) => e.action === 'request.submitted');
    expect(submitted).toBeDefined();
    expect(JSON.stringify(submitted?.metadata)).not.toContain('Rollator');
    expect(submitted?.entityId).toBe(request.id);
  });
});

describe('Meldung eines Problems', () => {
  it('erzeugt sofort einen Vorfall mit Bearbeitungszusage', async () => {
    const result = await service.reportProblem({
      reporterId: 'u_seeker_1',
      category: 'grenzverletzung',
      description: 'Die Person hat mich gegen meinen Willen angefasst.',
      subjectUserId: 'u_provider_3',
    });
    expect(result.responseTargetHours).toBe(1);
    const incidents = await data.safety.incidents();
    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.priority).toBe('critical');
    expect(incidents[0]?.requiresFourEyes).toBe(true);
    // Der Freitext darf nicht in der Fallübersicht landen.
    expect(incidents[0]?.summary).not.toContain('angefasst');
  });
});

describe('Ablauf für eine anbietende Person', () => {
  it('zeigt eine erlaubnispflichtige Anfrage nur der geprüften Fachkraft', async () => {
    const pflege = {
      ...draft(),
      id: 'req_pflege',
      categoryKeys: ['pflegerische_unterstuetzung'],
    };
    const request = await service.submitRequest(pflege);
    expect(request.requiresLicensedProfessional).toBe(true);

    const suggestions = await service.suggestProviders(request.id);
    expect(suggestions.map((s) => s.match.providerId)).toEqual(['u_provider_1']);
  });

  it('zeigt vor der Annahme nur, was für die Entscheidung nötig ist', async () => {
    const request = await service.submitRequest(draft());
    const preview = await service.requestPreviewForProvider(request.id);
    const keys = Object.keys(preview.seeker);
    expect(keys).not.toContain('phone');
    expect(keys).not.toContain('preciseAddress');
    expect(preview.seeker.withheldFields.length).toBeGreaterThan(0);
  });
});

describe('Vertrauensperson', () => {
  it('sieht das Profil nur im Rahmen der erteilten Berechtigung', async () => {
    const profile = (await data.seekers.get('u_seeker_1'))!;
    const grants = await data.trust.forSeeker('u_seeker_1');
    const scopes = grants[0]!.scopes;
    const sicht = redactSeekerProfile(profile, { kind: 'trusted_person', scopes });
    expect(sicht.aboutMe).toBeDefined();

    const ohne = redactSeekerProfile(profile, { kind: 'trusted_person', scopes: [] });
    expect(ohne.aboutMe).toBeUndefined();
  });

  it('protokolliert eine unterstützt erteilte Einwilligung als solche', () => {
    const record = grantConsent('u_seeker_1', 'push_notifications', NOW, {
      channel: 'assisted_by_trusted_person',
      assistedBy: 'u_trusted_1',
      id: 'c_assist',
    });
    expect(record.channel).toBe('assisted_by_trusted_person');
    expect(record.assistedBy).toBe('u_trusted_1');
  });
});
