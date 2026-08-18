import type { JarvisContext } from '../context.js';
import { grundregeln, gedaechtnisBlock } from './prompts.js';

/**
 * Der Gesprächsmodus.
 *
 * Gesprochen gelten andere Regeln als geschrieben. Eine Aufzählung mit sieben
 * Punkten kann man überfliegen; vorgelesen ist sie eine Zumutung. Kennungen
 * wie „mail_a1b2c3" sind gesprochen sinnlos. Und wer redet, wird unterbrochen,
 * fragt nach und antwortet in einem Satz statt in einem Absatz.
 *
 * Deshalb bekommt JarvisCore im Gesprächsmodus diesen Zusatz -- kein anderes
 * Modell, keine andere Werkzeugliste, nur andere Sprechregeln.
 */
export function gespraechsPrompt(ctx: JarvisContext, name: string | null): string {
  return [
    grundregeln(ctx),
    '',
    'DU SPRICHST GERADE — nicht schreiben, reden.',
    '',
    name ? `Dein Gegenüber heißt ${name}. Sprich die Person gelegentlich mit Namen an, aber nicht in jedem Satz.` : '',
    '',
    'So klingst du:',
    '- Ein bis drei Sätze. Wer mehr wissen will, fragt nach.',
    '- Ganze Sätze, aber gesprochene: kurz, ohne Schachtelsatz, ohne Doppelpunkt-Listen.',
    '- Keine Kennungen, keine URLs, keine Dateipfade, keine Aufzählungszeichen.',
    '  Statt „Entwurf mail_7f3a" sagst du „der Entwurf an Nordbau".',
    '- Zahlen rundest du beim Sprechen, wenn es die Aussage nicht verfälscht:',
    '  „gut zwanzig" statt „einundzwanzig", aber Beträge und Adressen genau.',
    '- Du darfst „Moment" oder „einen Augenblick" sagen, wenn etwas dauert.',
    '',
    'So führst du das Gespräch:',
    '- Ist etwas unklar, fragst du nach, statt zu raten. Eine Frage, nicht drei.',
    '- Nach einer erledigten Sache bietest du den naheliegenden nächsten Schritt an,',
    '  wenn es einen gibt. Wenn nicht, sagst du nichts weiter.',
    '- Du plauderst nicht ohne Anlass. Wetter, Befinden und Small Talk nur, wenn',
    '  dein Gegenüber damit anfängt.',
    '- Wiederhole nicht, was gerade gesagt wurde. Bestätige knapp und mach weiter.',
    '',
    'Freigaben im Gespräch:',
    'Du nennst Empfänger und Betreff und fragst klar: „Soll ich das an … senden?"',
    'Ein „ja" allein reicht dir nicht als Freigabe, wenn du nicht unmittelbar davor',
    'genau danach gefragt hast — dann fragst du noch einmal ausdrücklich nach.',
    gedaechtnisBlock(ctx),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Ein Grund, von sich aus etwas zu sagen. */
export interface Gespraechsanlass {
  /** Womit JARVIS das Gespräch eröffnet -- fertig zum Vorlesen. */
  text: string;
  /** Wie dringend; die höchste Zahl gewinnt. */
  gewicht: number;
  art: 'freigabe' | 'termin' | 'antwort' | 'aufgabe' | 'fehler' | 'gruss';
}

/**
 * Warum JARVIS das Gespräch eröffnen könnte.
 *
 * Alles hier stammt aus dem tatsächlichen Zustand. Es gibt bewusst keine
 * erfundenen Gesprächseinstiege („Wie war Ihr Wochenende?") -- ein Assistent,
 * der Anteilnahme simuliert, ohne etwas zu wissen, wird schnell lästig.
 */
export async function gespraechsanlaesse(ctx: JarvisContext, jetzt = new Date()): Promise<Gespraechsanlass[]> {
  const anlaesse: Gespraechsanlass[] = [];

  // --- Was auf eine Entscheidung wartet ----------------------------------
  const offen = ctx.approvals.pending();
  if (offen.length === 1) {
    anlaesse.push({
      text: `Eine Sache wartet noch auf Ihre Freigabe: ${offen[0]!.title}. Soll ich sie Ihnen vorlesen?`,
      gewicht: 90,
      art: 'freigabe',
    });
  } else if (offen.length > 1) {
    anlaesse.push({
      text: `${offen.length} Freigaben warten auf Sie. Soll ich sie durchgehen?`,
      gewicht: 90,
      art: 'freigabe',
    });
  }

  // --- Fehlgeschlagene Sendungen -----------------------------------------
  const fehlgeschlagen = ctx.repos.emails.list({ status: 'fehlgeschlagen', limit: 5 });
  if (fehlgeschlagen.length > 0) {
    const erste = fehlgeschlagen[0]!;
    anlaesse.push({
      text:
        fehlgeschlagen.length === 1
          ? `Eine Mail ging nicht raus, an ${erste.to_address}. Soll ich sagen, woran es lag?`
          : `${fehlgeschlagen.length} Mails sind nicht rausgegangen. Soll ich die Gründe durchgehen?`,
      gewicht: 80,
      art: 'fehler',
    });
  }

  // --- Antworten, die noch niemand angesehen hat -------------------------
  const antworten = ctx.repos.emails.list({ status: 'eingegangen', limit: 20 });
  const seitGestern = antworten.filter(
    (e) => e.received_at && new Date(e.received_at).getTime() > jetzt.getTime() - 36 * 3_600_000,
  );
  if (seitGestern.length > 0) {
    anlaesse.push({
      text:
        seitGestern.length === 1
          ? 'Es ist eine Antwort eingegangen. Soll ich sie vorlesen?'
          : `Es sind ${seitGestern.length} Antworten eingegangen. Soll ich sie durchgehen?`,
      gewicht: 70,
      art: 'antwort',
    });
  }

  // --- Termine heute ------------------------------------------------------
  if (ctx.calendar.isConfigured()) {
    const bisEndeDesTages = new Date(jetzt);
    bisEndeDesTages.setHours(23, 59, 59, 999);
    const termine = await ctx.calendar.events({ from: jetzt, to: bisEndeDesTages });
    if (termine.ok && termine.data.length > 0) {
      const naechster = termine.data[0]!;
      const zeit = naechster.allDay
        ? 'heute'
        : `um ${new Date(naechster.start).toLocaleTimeString(ctx.env.JARVIS_LOCALE, { hour: '2-digit', minute: '2-digit' })}`;
      anlaesse.push({
        text:
          termine.data.length === 1
            ? `Heute steht noch ein Termin an: ${naechster.summary}, ${zeit}.`
            : `Heute stehen noch ${termine.data.length} Termine an, der nächste ${zeit}: ${naechster.summary}.`,
        gewicht: 60,
        art: 'termin',
      });
    }
  }

  // --- Fällige Aufgaben ----------------------------------------------------
  const aufgaben = ctx.repos.tasks.list({ status: 'offen', limit: 20 });
  const faellig = aufgaben.filter((a) => a.due_at && new Date(a.due_at).getTime() <= jetzt.getTime());
  if (faellig.length > 0) {
    anlaesse.push({
      text:
        faellig.length === 1
          ? `Eine Aufgabe ist fällig: ${faellig[0]!.title}.`
          : `${faellig.length} Aufgaben sind fällig, zum Beispiel ${faellig[0]!.title}.`,
      gewicht: 50,
      art: 'aufgabe',
    });
  }

  return anlaesse.sort((a, b) => b.gewicht - a.gewicht);
}

/**
 * Der Satz, mit dem JARVIS sich meldet.
 *
 * Gibt es einen echten Anlass, nennt er ihn. Gibt es keinen, sagt er das
 * Kürzestmögliche und schweigt dann -- er soll kein Gespräch erfinden.
 */
export async function begruessung(ctx: JarvisContext, jetzt = new Date()): Promise<string> {
  const anlaesse = await gespraechsanlaesse(ctx, jetzt);
  if (anlaesse.length > 0) return anlaesse[0]!.text;

  const stunde = jetzt.getHours();
  if (stunde < 5) return 'Ja?';
  if (stunde < 11) return 'Moin. Was steht an?';
  if (stunde < 18) return 'Ja?';
  return 'Ja, bitte?';
}
