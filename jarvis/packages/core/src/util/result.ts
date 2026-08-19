/**
 * Einheitliches Ergebnisformat fuer alle Tools und Services.
 *
 * Grundregel des Projekts: Ein Agent darf niemals behaupten, etwas getan zu
 * haben. Jede reale Aktion laeuft ueber ein Tool, und jedes Tool liefert
 * dieses Objekt zurueck. Schlaegt etwas fehl, steht `ok: false` mit einem
 * maschinenlesbaren Code darin -- das Modell bekommt das unveraendert zu
 * sehen und kann keinen Erfolg vortaeuschen.
 */

export type ErrorCode =
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_MISSING'
  | 'APPROVAL_STALE'
  | 'NOT_CONFIGURED'
  | 'NOT_IMPLEMENTED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'SUPPRESSED'
  | 'RATE_LIMITED'
  | 'UNVERIFIED_RECIPIENT'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR'
  | 'PERMISSION_DENIED'
  | 'ROBOTS_DISALLOWED'
  | 'TIMEOUT'
  | 'SEND_FAILED'
  | 'INTERNAL_ERROR';

export interface ToolError {
  code: ErrorCode;
  /** Klartext fuer Nutzer und Modell -- immer auf Deutsch. */
  message: string;
  /** Konkreter naechster Schritt, falls es einen gibt. */
  hint?: string;
  /** Rohdetails des Anbieters (SMTP-Antwort, HTTP-Status ...). */
  detail?: unknown;
}

export interface Ok<T> {
  ok: true;
  data: T;
  /** Freie Zusatzinformationen (Dauer, Quelle, Anbieter). */
  meta?: Record<string, unknown>;
}

export interface Err {
  ok: false;
  error: ToolError;
  meta?: Record<string, unknown>;
}

export type Result<T> = Ok<T> | Err;

export function ok<T>(data: T, meta?: Record<string, unknown>): Ok<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data };
}

export function err(
  code: ErrorCode,
  message: string,
  extra?: { hint?: string; detail?: unknown; meta?: Record<string, unknown> },
): Err {
  const error: ToolError = { code, message };
  if (extra?.hint) error.hint = extra.hint;
  if (extra?.detail !== undefined) error.detail = extra.detail;
  return extra?.meta ? { ok: false, error, meta: extra.meta } : { ok: false, error };
}

export function isOk<T>(r: Result<T>): r is Ok<T> {
  return r.ok === true;
}

export function isErr<T>(r: Result<T>): r is Err {
  return r.ok === false;
}

/** Wirft bei Fehler -- nur im Anwendungscode benutzen, nie in Tool-Handlern. */
export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.data;
  throw new JarvisError(r.error.code, r.error.message, r.error.hint, r.error.detail);
}

export class JarvisError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly hint?: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'JarvisError';
  }

  toResult(): Err {
    return err(this.code, this.message, { hint: this.hint, detail: this.detail });
  }
}

/** Kapselt eine beliebige Ausnahme in ein Err, ohne den Stacktrace zu verlieren. */
export function fromException(e: unknown, fallbackCode: ErrorCode = 'INTERNAL_ERROR'): Err {
  if (e instanceof JarvisError) return e.toResult();
  if (e instanceof Error) {
    const code =
      e.name === 'AbortError' || /timed? ?out/i.test(e.message) ? 'TIMEOUT' : fallbackCode;
    return err(code, e.message, { detail: { name: e.name, stack: e.stack } });
  }
  return err(fallbackCode, String(e));
}
