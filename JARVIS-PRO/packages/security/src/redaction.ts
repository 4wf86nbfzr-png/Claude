/**
 * Redaction fuer Logs. Ziel: In den Standardlogs steht nie ein Geheimnis und
 * nie ein Nachrichteninhalt. Was zur Diagnose gebraucht wird - IDs, Kanal,
 * Zeitpunkt, Statuscode - bleibt lesbar.
 */

/** Schluesselnamen, deren Wert immer vollstaendig ersetzt wird. */
const SECRET_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'passwd',
  'secret',
  'client_secret',
  'clientsecret',
  'app_secret',
  'appsecret',
  'api_key',
  'apikey',
  'anthropic_api_key',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'token',
  'pin',
  'pin_hash',
  'code_verifier',
  'verifier',
  'signature',
  'x-hub-signature-256',
  'ari_password',
  'verify_token',
];

/** Schluesselnamen, deren Wert Nachrichteninhalt ist. */
const CONTENT_KEYS = ['body', 'text', 'content', 'message', 'preview', 'transcript', 'snippet'];

/** Schluesselnamen mit personenbezogenen Kontaktdaten - gekuerzt, nicht geloescht. */
const PII_KEYS = ['email', 'recipient', 'sender', 'senderaddress', 'from', 'to', 'phone', 'peer'];

export const REDACTED = '[redigiert]';

const EMAIL_RE = /\b[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}\b/gu;
const PHONE_RE = /\+\d[\d\s/().-]{6,}\d/g;
const BEARER_RE = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Za-z0-9]{4}){2,7}\b/g;
const LONG_SECRET_RE = /\b[A-Za-z0-9_-]{40,}\b/g;

export interface RedactionOptions {
  /** Nachrichteninhalte mitloggen. Nur fuer lokales Debugging, nie in Produktion. */
  readonly allowMessageBodies?: boolean;
  readonly maxDepth?: number;
}

/** Kuerzt eine E-Mail-Adresse auf `a***@domain.tld`. */
export function maskEmail(addr: string): string {
  const at = addr.lastIndexOf('@');
  if (at <= 0) return maskTail(addr);
  const local = addr.slice(0, at);
  const domain = addr.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(1, Math.min(6, local.length - 1)))}@${domain}`;
}

/** Kuerzt eine Rufnummer auf `+49***5678`. */
export function maskPhone(p: string): string {
  const digits = p.replace(/\D/g, '');
  if (digits.length < 5) return '***';
  const cc = p.startsWith('+') ? `+${digits.slice(0, 2)}` : digits.slice(0, 2);
  return `${cc}***${digits.slice(-4)}`;
}

export function maskTail(v: string, keep = 4): string {
  if (v.length <= keep) return '*'.repeat(v.length);
  return `${'*'.repeat(Math.min(8, v.length - keep))}${v.slice(-keep)}`;
}

/** Redigiert freien Text: Adressen, Nummern, Tokens. */
export function redactString(s: string): string {
  return s
    .replace(BEARER_RE, (m) => `${m.split(/\s+/)[0] ?? ''} ${REDACTED}`)
    .replace(JWT_RE, REDACTED)
    .replace(IBAN_RE, REDACTED)
    .replace(EMAIL_RE, (m) => maskEmail(m))
    .replace(PHONE_RE, (m) => maskPhone(m))
    .replace(LONG_SECRET_RE, (m) => (/^[A-Fa-f0-9]{64}$/.test(m) ? m : REDACTED));
}

function classify(key: string): 'secret' | 'content' | 'pii' | 'plain' {
  const k = key.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (SECRET_KEYS.some((s) => k === s.replace(/[^a-z0-9-]/g, '') || k.endsWith(s.replace(/_/g, '')))) {
    return 'secret';
  }
  if (CONTENT_KEYS.includes(k)) return 'content';
  if (PII_KEYS.includes(k)) return 'pii';
  return 'plain';
}

/**
 * Redigiert eine beliebige Struktur fuer das Log. Zyklen werden erkannt,
 * die Tiefe ist begrenzt - ein Log-Aufruf darf nie zur Endlosschleife werden.
 */
export function redact(value: unknown, opts: RedactionOptions = {}): unknown {
  const maxDepth = opts.maxDepth ?? 8;
  const seen = new WeakSet<object>();

  const walk = (v: unknown, depth: number): unknown => {
    if (depth > maxDepth) return '[zu tief]';
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') return redactString(v);
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return v;
    if (v instanceof Date) return v.toISOString();
    if (v instanceof Error) {
      return { name: v.name, message: redactString(v.message) };
    }
    if (Buffer.isBuffer(v)) return `[binaer ${v.length} B]`;
    if (ArrayBuffer.isView(v)) return `[binaer ${v.byteLength} B]`;
    if (Array.isArray(v)) {
      if (seen.has(v)) return '[zyklisch]';
      seen.add(v);
      return v.slice(0, 100).map((x) => walk(x, depth + 1));
    }
    if (typeof v === 'object') {
      if (seen.has(v)) return '[zyklisch]';
      seen.add(v);
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const kind = classify(k);
        if (kind === 'secret') {
          out[k] = REDACTED;
        } else if (kind === 'content') {
          out[k] =
            opts.allowMessageBodies === true
              ? walk(val, depth + 1)
              : typeof val === 'string'
                ? `[inhalt ${val.length} zeichen]`
                : REDACTED;
        } else if (kind === 'pii' && typeof val === 'string') {
          out[k] = val.includes('@') ? maskEmail(val) : val.startsWith('+') ? maskPhone(val) : maskTail(val);
        } else {
          out[k] = walk(val, depth + 1);
        }
      }
      return out;
    }
    return '[unbekannt]';
  };

  return walk(value, 0);
}
