import { CHANNEL_LABEL_DE, type OutboundDraft } from '@jarvis/domain';

/**
 * Der Read-back-Text.
 *
 * Reihenfolge und Inhalt sind durch die Anforderung festgelegt: Kanal,
 * Empfaenger, bei E-Mail der Betreff, der vollstaendige finale Text, die
 * Anhaenge, dann die Frage. Der Text wird gehasht - was vorgelesen wurde,
 * ist genau das, was gesendet wird.
 *
 * Es gibt zwei Darstellungen desselben Entwurfs:
 *
 *   'voice'  am Telefon. Die Empfaengeradresse wird buchstabiert, damit Noah
 *            einen Zahlendreher oder eine falsche Domain HOERT.
 *   'text'   im Chat. Dort waere Buchstabieren unlesbar; die Adresse steht
 *            woertlich da, weil Noah sie mit den Augen prueft.
 *
 * Beide sind aus demselben Entwurf eindeutig ableitbar. Welche Darstellung
 * verwendet wurde, muss der Aufrufer beim Bestaetigen wieder mitgeben - sonst
 * schlaegt der Abgleich fehl, und das ist so gewollt: es darf nicht moeglich
 * sein, eine Fassung zu zeigen und eine andere zu binden.
 */
export type ReadBackFormat = 'voice' | 'text';

export interface ReadBackScript {
  readonly lines: readonly string[];
  readonly full: string;
  readonly question: string;
  readonly format: ReadBackFormat;
}

export function buildReadBack(draft: OutboundDraft, format: ReadBackFormat = 'voice'): ReadBackScript {
  const lines: string[] = [];
  const recipient = format === 'voice' ? spellRecipient(draft.recipient) : draft.recipient;

  lines.push(`Kanal: ${CHANNEL_LABEL_DE[draft.channel]}.`);
  lines.push(`Empfaenger: ${recipient}.`);
  if (draft.channel === 'email') {
    lines.push(`Betreff: ${draft.subject === null || draft.subject.trim() === '' ? 'ohne Betreff' : draft.subject}.`);
  }
  lines.push('Der Text lautet:');
  lines.push(draft.body.trim());
  if (draft.attachments.length === 0) {
    lines.push('Ohne Anhang.');
  } else {
    const names = draft.attachments.map((a) => a.name).join(', ');
    lines.push(
      `${draft.attachments.length === 1 ? 'Ein Anhang' : `${draft.attachments.length} Anhaenge`}: ${names}.`,
    );
  }

  // Die Frage ist in beiden Darstellungen dieselbe. Im Chat kommt der Hinweis
  // auf die verlangte Antwort dazu - am Telefon steht er im gesprochenen
  // Ablauf, hier muss er sichtbar sein, sonst raet Noah.
  const question =
    format === 'voice'
      ? 'Soll ich genau diese Version jetzt senden?'
      : 'Soll ich genau diese Version jetzt senden? Antworte mit "Ja, senden" - ein blosses "ja" reicht nicht.';

  return { lines, full: lines.join('\n'), question, format };
}

/**
 * Empfaenger so aufbereiten, dass er am Telefon eindeutig ist.
 * E-Mail-Adressen werden buchstabiert gesprochen ("at", "Punkt"), damit
 * Noah einen Zahlendreher oder eine falsche Domain hoert.
 */
export function spellRecipient(recipient: string): string {
  if (recipient.includes('@')) {
    return recipient.replace('@', ' at ').split('.').join(' Punkt ');
  }
  // Rufnummer in Zweiergruppen - so liest ein Mensch sie auch vor.
  const digits = recipient.replace(/[^\d+]/g, '');
  const plus = digits.startsWith('+');
  const rest = plus ? digits.slice(1) : digits;
  const groups = rest.match(/\d{1,2}/g) ?? [rest];
  return `${plus ? 'plus ' : ''}${groups.join(' ')}`;
}
