/**
 * Aussprachelexikon fuer die Sprachausgabe.
 *
 * Piper spricht deutsche Texte gut, stolpert aber ueber englische Firmennamen,
 * Abkuerzungen und Zeichen, die in E-Mails haeufig vorkommen. Statt am Modell
 * zu drehen, wird der Text vor der Synthese umgeschrieben - das ist
 * nachvollziehbar, testbar und jederzeit erweiterbar.
 */
export interface LexiconEntry {
  readonly pattern: RegExp;
  readonly replacement: string;
}

const ENTRIES: readonly LexiconEntry[] = [
  // Englische Namen und Produkte
  { pattern: /\bWhatsApp\b/g, replacement: 'Whats-App' },
  { pattern: /\bOutlook\b/g, replacement: 'Aut-luck' },
  { pattern: /\bMicrosoft\b/g, replacement: 'Meikrosoft' },
  { pattern: /\bGoogle\b/g, replacement: 'Gugl' },
  { pattern: /\bCloud\b/g, replacement: 'Klaud' },
  { pattern: /\bTeams\b/g, replacement: 'Tiems' },
  { pattern: /\bHostess\b/gi, replacement: 'Hostess' },
  { pattern: /\bSecplan\b/gi, replacement: 'Sec-Plan' },
  { pattern: /\bHERM\b/g, replacement: 'Herm' },

  // Abkuerzungen, die sonst buchstabiert klingen
  { pattern: /\bz\.\s?B\./g, replacement: 'zum Beispiel' },
  { pattern: /\bd\.\s?h\./g, replacement: 'das heisst' },
  { pattern: /\bu\.\s?a\./g, replacement: 'unter anderem' },
  { pattern: /\bbzw\./g, replacement: 'beziehungsweise' },
  { pattern: /\bggf\./g, replacement: 'gegebenenfalls' },
  { pattern: /\bevtl\./g, replacement: 'eventuell' },
  { pattern: /\binkl\./g, replacement: 'inklusive' },
  { pattern: /\bexkl\./g, replacement: 'exklusive' },
  { pattern: /\bca\./g, replacement: 'circa' },
  { pattern: /\bMio\./g, replacement: 'Millionen' },
  { pattern: /\bNr\./g, replacement: 'Nummer' },
  { pattern: /\bStr\./g, replacement: 'Strasse' },
  { pattern: /\bTel\./g, replacement: 'Telefon' },
  { pattern: /\bMwSt\.?/g, replacement: 'Mehrwertsteuer' },
  { pattern: /\bAUeG\b/g, replacement: 'Arbeitnehmerueberlassungsgesetz' },

  // Zeichen
  { pattern: /&/g, replacement: ' und ' },
  { pattern: /(\d)\s*€/g, replacement: '$1 Euro' },
  { pattern: /€\s*(\d)/g, replacement: '$1 Euro' },
  { pattern: /(\d)\s*%/g, replacement: '$1 Prozent' },
  { pattern: /\bca\b(?!\.)/g, replacement: 'circa' },

  // Uhrzeiten: "17:30" -> "17 Uhr 30", "17:00" -> "17 Uhr"
  { pattern: /\b(\d{1,2}):00\b/g, replacement: '$1 Uhr' },
  { pattern: /\b(\d{1,2}):(\d{2})\b/g, replacement: '$1 Uhr $2' },

  // E-Mail-Adressen buchstabengetreu vorlesen
  { pattern: /@/g, replacement: ' at ' },
];

/** Wendet das Lexikon an. Reihenfolge ist Absicht - Abkuerzungen vor Zeichen. */
export function applyLexicon(text: string, extra: readonly LexiconEntry[] = []): string {
  let out = text;
  for (const e of [...ENTRIES, ...extra]) {
    out = out.replace(e.pattern, e.replacement);
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

export const DEFAULT_LEXICON = ENTRIES;
