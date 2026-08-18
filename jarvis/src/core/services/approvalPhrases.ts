/**
 * Classifies a spoken or typed utterance as approval, rejection or unclear.
 *
 * Deliberately conservative: everything that is not an unmistakable approval
 * comes back as `unklar`, and the caller must then ask (specification §2).
 * A sentence that contains any negation, any question mark or any conditional
 * marker can never be an approval, however many approval words it contains —
 * "soll ich das senden?" and "noch nicht senden" must not send a mail.
 */
export type ApprovalIntent = 'freigabe' | 'ablehnung' | 'unklar';

/** Phrases that mean "send it" on their own. */
const APPROVE_PATTERNS: RegExp[] = [
  /\bfreigeben\b/,
  /\bfreigabe erteilt\b/,
  /\bgenehmigt\b/,
  /\bsenden\b/,
  /\babsenden\b/,
  /\babschicken\b/,
  /\bverschicken\b/,
  /\bversenden\b/,
  /\bschick(?:e|en)? (?:sie |ihn |es |die mail |die e-?mail )?(?:ab|raus|los)\b/,
  /\braus damit\b/,
  /\bmach(?:e)? das\b/,
  /\bbestätige(?:n)?\b/,
];

const REJECT_PATTERNS: RegExp[] = [
  /\babbrechen\b/,
  /\babbruch\b/,
  /\bstopp?\b/,
  /\bhalt\b/,
  /\bnicht senden\b/,
  /\bnicht abschicken\b/,
  /\bnicht freigeben\b/,
  /\bverwerfen\b/,
  /\bl[oö]schen\b/,
  /\bablehnen\b/,
  /^\s*nein\b/,
  /\bdoch nicht\b/,
  /\blieber nicht\b/,
];

/**
 * Words that turn any sentence into a non-approval. `nicht`/`kein` are the
 * obvious ones; the rest are hedges and conditionals that show the user is
 * still deliberating.
 */
const BLOCKERS: RegExp[] = [
  /\bnicht\b/,
  /\bkeine?n?\b/,
  /\bnie\b/,
  /\bnoch\b/,
  /\bwarte\b/,
  /\bmoment\b/,
  /\bvielleicht\b/,
  /\beventuell\b/,
  /\bk[oö]nnte(?:st)?\b/,
  /\bsollte(?:st)?\b/,
  /\bwenn\b/,
  /\bfalls\b/,
  /\bvorher\b/,
  /\bzuerst\b/,
  /\berst\b/,
  /\bsp[aä]ter\b/,
  /\bmorgen\b/,
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('ß', 'ss')
    .replace(/[„“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bare confirmations only count when the whole utterance is that confirmation. */
const BARE_YES = /^(ja|jawohl|jep|jo|okay|ok|klar|passt|perfekt|einverstanden|genau so|genau)([ ,!.]*(bitte|danke|machen wir|los))?[ ,!.]*$/;

const BARE_NO = /^(nein|nee|n[oö]|negativ|auf keinen fall)[ ,!.]*$/;

export function classifyApproval(utterance: string): ApprovalIntent {
  const text = normalize(utterance);
  if (!text) return 'unklar';

  // A question is never an approval, even a rhetorical one.
  if (text.includes('?')) return 'unklar';

  if (BARE_NO.test(text)) return 'ablehnung';
  if (REJECT_PATTERNS.some((pattern) => pattern.test(text))) return 'ablehnung';

  if (BARE_YES.test(text)) return 'freigabe';

  const blocked = BLOCKERS.some((pattern) => pattern.test(text));
  if (blocked) return 'unklar';

  if (APPROVE_PATTERNS.some((pattern) => pattern.test(text))) return 'freigabe';

  // "ja, genau so senden" — a leading yes plus an approval verb.
  if (/^(ja|okay|ok|klar|gut|perfekt)\b/.test(text) && APPROVE_PATTERNS.some((p) => p.test(text))) {
    return 'freigabe';
  }

  return 'unklar';
}
