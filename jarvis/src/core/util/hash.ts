import { createHash } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface HashableMail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  attachments?: { filename: string; path: string }[];
}

/**
 * Inhaltsprüfsumme einer E-Mail.
 *
 * Sie bindet eine erteilte Freigabe an exakt diesen Text: Wird der Entwurf
 * nach der Freigabe geändert, passt die Prüfsumme nicht mehr und der Versand
 * wird verweigert. Das ist die technische Absicherung von Regel §2.
 */
export function mailContentHash(mail: HashableMail): string {
  const normalized = JSON.stringify({
    to: [...mail.to].map((a) => a.trim().toLowerCase()).sort(),
    cc: [...(mail.cc ?? [])].map((a) => a.trim().toLowerCase()).sort(),
    bcc: [...(mail.bcc ?? [])].map((a) => a.trim().toLowerCase()).sort(),
    subject: mail.subject.trim(),
    body: mail.bodyText.replace(/\r\n/g, '\n').trim(),
    attachments: [...(mail.attachments ?? [])]
      .map((a) => `${a.filename}:${a.path}`)
      .sort()
  });
  return sha256(normalized);
}

/** Prüfsumme für beliebige Freigabe-Nutzlasten (Dateilöschung, Installation …). */
export function payloadHash(payload: unknown): string {
  return sha256(stableStringify(payload));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}
