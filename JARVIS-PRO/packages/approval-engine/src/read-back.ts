import { CHANNEL_LABEL_DE, type OutboundDraft } from '@jarvis/domain';

/**
 * Der Read-back-Text.
 *
 * Reihenfolge und Inhalt sind durch die Anforderung festgelegt: Kanal,
 * Empfaenger, bei E-Mail der Betreff, der vollstaendige finale Text, die
 * Anhaenge, dann die Frage. Der Text wird gehasht - was vorgelesen wurde,
 * ist genau das, was gesendet wird.
 */
export interface ReadBackScript {
  readonly lines: readonly string[];
  readonly full: string;
  readonly question: string;
}

export function buildReadBack(draft: OutboundDraft): ReadBackScript {
  const lines: string[] = [];
  lines.push(`Kanal: ${CHANNEL_LABEL_DE[draft.channel]}.`);
  lines.push(`Empfaenger: ${spellRecipient(draft.recipient)}.`);
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
  const question = 'Soll ich genau diese Version jetzt senden?';
  return { lines, full: lines.join('\n'), question };
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
