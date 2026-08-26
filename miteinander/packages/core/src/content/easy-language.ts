import type { EasyLanguageItem } from '../domain/types';

/**
 * Leichte Sprache.
 *
 * Die Texte hier sind Entwuerfe des Produktteams. Leichte Sprache muss nach
 * dem Netzwerk-Leichte-Sprache-Regelwerk von einer Pruefgruppe aus Menschen
 * mit Lernschwierigkeiten geprueft werden. Bis dahin steht der Status auf
 * "draft" -- und die Oberflaeche weist darauf hin.
 */

export const EASY_TEXTS: EasyLanguageItem[] = [
  {
    key: 'home.title',
    text: 'Was möchten Sie tun?',
    status: 'draft',
  },
  {
    key: 'home.seek',
    text: 'Ich suche Unterstützung.\nJemand hilft mir im Alltag.',
    status: 'draft',
  },
  {
    key: 'home.offer',
    text: 'Ich biete Unterstützung an.\nIch möchte anderen Menschen helfen.',
    status: 'draft',
  },
  {
    key: 'home.assisted',
    text: 'Jemand hilft mir bei der Bedienung.\nZum Beispiel eine Person aus meiner Familie.',
    status: 'draft',
  },
  {
    key: 'mode.simple',
    text: 'Einfach.\nSehr große Knöpfe.\nWenig Text auf einer Seite.',
    status: 'draft',
  },
  {
    key: 'mode.standard',
    text: 'Normal.\nSie sehen alles auf einen Blick.',
    status: 'draft',
  },
  {
    key: 'mode.custom',
    text: 'Selbst einstellen.\nSie bestimmen: Schrift, Farben, Vorlesen.',
    status: 'draft',
  },
  {
    key: 'emergency.notice',
    text: 'Diese App ist kein Notruf.\nIst jemand in Gefahr?\nDann rufen Sie an: 1 1 2.',
    status: 'draft',
  },
  {
    key: 'privacy.address',
    text: 'Ihre genaue Adresse sieht niemand.\nAndere sehen nur Ihren Ort.',
    status: 'draft',
  },
  {
    key: 'booking.confirm',
    text: 'Möchten Sie den Termin buchen?\nDann tippen Sie auf: Ja, Termin buchen.',
    status: 'draft',
  },
  {
    key: 'draft.saved',
    text: 'Ihre Eingaben sind gespeichert.\nSie können später weitermachen.',
    status: 'draft',
  },
  {
    key: 'help.where',
    text: 'Sie brauchen Hilfe bei der App?\nTippen Sie unten auf: Hilfe.',
    status: 'draft',
  },
];

export class EasyLanguageRegistry {
  private items = new Map<string, EasyLanguageItem>();

  constructor(items: readonly EasyLanguageItem[] = EASY_TEXTS) {
    for (const item of items) this.items.set(item.key, { ...item });
  }

  get(key: string): EasyLanguageItem | undefined {
    return this.items.get(key);
  }

  /**
   * Liefert den Text und sagt dazu, ob er geprueft ist. Aufrufer muessen den
   * Hinweis anzeigen -- deshalb ist er Teil des Rueckgabewerts und nicht optional.
   */
  resolve(key: string, fallback: string): { text: string; reviewed: boolean; notice: string | null } {
    const item = this.items.get(key);
    if (!item) {
      return {
        text: fallback,
        reviewed: false,
        notice: 'Dieser Text ist noch nicht in Leichter Sprache geprüft.',
      };
    }
    return {
      text: item.text,
      reviewed: item.status === 'approved',
      notice:
        item.status === 'approved'
          ? null
          : 'Dieser Text ist ein Entwurf. Er wird noch von einer Prüfgruppe geprüft.',
    };
  }

  approve(key: string, reviewedBy: string, reviewedAt: string): EasyLanguageItem {
    const item = this.items.get(key);
    if (!item) throw new Error(`Unbekannter Text: ${key}`);
    if (!reviewedBy.trim()) throw new Error('Die Prüfgruppe muss benannt sein.');
    const next: EasyLanguageItem = { ...item, status: 'approved', reviewedBy, reviewedAt };
    this.items.set(key, next);
    return next;
  }

  coverage(): { approved: number; total: number } {
    const all = [...this.items.values()];
    return { approved: all.filter((i) => i.status === 'approved').length, total: all.length };
  }
}

/**
 * Grobe Pruefung auf Regelverstoesse in Leichter Sprache.
 * Ersetzt keine Pruefgruppe, faengt aber offensichtliche Faelle im Test ab.
 */
export interface EasyLanguageFinding {
  rule: string;
  detail: string;
}

const LONG_SENTENCE_WORDS = 12;

export function checkEasyLanguage(text: string): EasyLanguageFinding[] {
  const findings: EasyLanguageFinding[] = [];
  const sentences = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    if (words.length > LONG_SENTENCE_WORDS) {
      findings.push({
        rule: 'kurze_saetze',
        detail: `Satz mit ${words.length} Wörtern: „${sentence}“`,
      });
    }
    for (const word of words) {
      const bare = word.replace(/[^\wÄÖÜäöüß-]/g, '');
      if (bare.length > 16 && !bare.includes('-')) {
        findings.push({
          rule: 'lange_woerter',
          detail: `Langes Wort ohne Trennung: „${bare}“`,
        });
      }
    }
  }

  if (/\b(bzw|ggf|z\.B|u\.a|etc)\b/i.test(text)) {
    findings.push({ rule: 'keine_abkuerzungen', detail: 'Abkürzungen vermeiden.' });
  }
  if (/\b(muss|müssen|kann|können)\s+\w+\s+werden\b/i.test(text)) {
    findings.push({ rule: 'aktiv_statt_passiv', detail: 'Passivkonstruktion gefunden.' });
  }
  return findings;
}
