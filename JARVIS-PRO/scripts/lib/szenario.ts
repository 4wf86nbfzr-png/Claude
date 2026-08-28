import type { ScriptedStep } from '../../apps/orchestrator/src/index.js';

/**
 * Das Drehbuch fuer die Simulatoren.
 *
 * Bewusst ein Drehbuch und kein Modell: die Simulatoren sollen den ABLAUF
 * zeigen, nicht die Formulierkunst eines Modells. Was hier passiert, passiert
 * im Betrieb genauso - nur die Saetze kommen dann vom Modell.
 *
 * Warum das hier liegt und nicht in den Skripten: es gibt zwei Simulatoren,
 * einen fuers Telefon und einen fuer den Chat. Zwei Kopien desselben
 * Drehbuchs wuerden auseinanderlaufen, und dann zeigt der eine Simulator
 * etwas anderes als der andere - genau das, wofuer man sie nicht gebrauchen
 * kann.
 */
export function buildSteps(eventRef: { id: string }): ScriptedStep[] {
  return [
    {
      match: /nein|noch nicht|nichts|keine zeit/i,
      tools: [{ name: 'read_open_events', args: { limit: 5 } }],
      speak: 'Alles klar, dann gehen wir das zusammen durch.',
    },
    {
      match: /ja.*(bearbeitet|erledigt|durch)/i,
      speak: 'Gut. Dann melde ich mich nur wegen dem, was neu reingekommen ist.',
    },
    {
      match: /vorlesen|lies|ganz|was steht drin|zeig/i,
      tools: [{ name: 'read_event', args: () => ({ eventId: eventRef.id }) }],
      speak: (results) =>
        (results[0] ?? '').includes('FREMDINHALT')
          ? 'Sabine Kroeger von Elbe Events braucht am Samstag, dem 9. Mai, vier Leute fuer den Einlass ' +
            'am Nordtor. Beginn 17 Uhr, Ende offen. Soll ich ihr antworten?'
          : 'Den Text bekomme ich gerade nicht.',
    },
    {
      match: /antworte|antwort|schreib|sag ihr|zusag/i,
      tools: [
        {
          name: 'draft_email_reply',
          args: () => ({
            eventId: eventRef.id,
            body:
              'Moin Frau Kroeger,\n\nvier Leute am Nordtor ab 17 Uhr geht klar. ' +
              'Die Einsatzleitung meldet sich am Freitag mit den Namen.\n\nBeste Gruesse\nNoah Benkhofer',
          }),
        },
        { name: 'request_approval', args: (last: string | null) => ({ draftId: extractDraftId(last) }) },
      ],
      speak: 'Ich habe zugesagt und die Namen fuer Freitag angekuendigt. Ich lese dir das jetzt vor.',
    },
    {
      match: /aufgabe|merk|erinner/i,
      tools: [
        {
          name: 'create_task',
          args: () => ({
            title: 'Namen fuer Hafengeburtstag an Elbe Events schicken',
            nextStep: 'Dienstplan pruefen, vier Leute festlegen',
            dueAtIso: null,
            originEventId: eventRef.id,
          }),
        },
      ],
      speak: 'Aufgabe angelegt: die Namen bis Freitag an Elbe Events.',
    },
    {
      match: /was steht an|aufgaben|offen/i,
      tools: [{ name: 'read_tasks', args: { limit: 10 } }],
      speak: (results) =>
        (results[0] ?? '').includes('Keine offenen')
          ? 'Es ist nichts offen.'
          : 'Offen ist: die Namen fuer den Hafengeburtstag an Elbe Events schicken.',
    },
  ];
}

export function extractDraftId(text: string | null): string {
  return /drf_[A-Za-z0-9_-]+/.exec(text ?? '')?.[0] ?? '';
}
