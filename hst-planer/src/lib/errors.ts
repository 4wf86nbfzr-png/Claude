/**
 * Fehlerklassen mit getrennter Benutzer- und Technikmeldung (Spec 53).
 * Der Benutzer sieht `userMessage`, das Serverlog bekommt den Rest.
 */

export class AppError extends Error {
  readonly status: number;
  readonly userMessage: string;
  readonly code: string;
  readonly details?: unknown;

  constructor(userMessage: string, options: { status?: number; code?: string; cause?: unknown; details?: unknown } = {}) {
    super(userMessage, { cause: options.cause });
    this.name = this.constructor.name;
    this.status = options.status ?? 500;
    this.code = options.code ?? 'FEHLER';
    this.userMessage = userMessage;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(userMessage = 'Bitte prüfen Sie Ihre Eingaben.', details?: unknown) {
    super(userMessage, { status: 400, code: 'UNGUELTIGE_EINGABE', details });
  }
}

export class AuthError extends AppError {
  constructor(userMessage = 'Bitte melden Sie sich an.') {
    super(userMessage, { status: 401, code: 'NICHT_ANGEMELDET' });
  }
}

export class ForbiddenError extends AppError {
  constructor(userMessage = 'Für diesen Bereich fehlt Ihnen die Berechtigung.') {
    super(userMessage, { status: 403, code: 'KEINE_BERECHTIGUNG' });
  }
}

export class NotFoundError extends AppError {
  constructor(userMessage = 'Der Datensatz wurde nicht gefunden.') {
    super(userMessage, { status: 404, code: 'NICHT_GEFUNDEN' });
  }
}

export class ConflictError extends AppError {
  constructor(userMessage: string, details?: unknown) {
    super(userMessage, { status: 409, code: 'KONFLIKT', details });
  }
}

export class RateLimitError extends AppError {
  constructor(userMessage = 'Zu viele Versuche. Bitte warten Sie einen Moment.') {
    super(userMessage, { status: 429, code: 'ZU_VIELE_ANFRAGEN' });
  }
}

/** Uebersetzt beliebige Fehler in eine Antwort, ohne Interna preiszugeben. */
export function toPublicError(error: unknown): { status: number; body: { error: string; code: string; details?: unknown } } {
  if (error instanceof AppError) {
    return { status: error.status, body: { error: error.userMessage, code: error.code, details: error.details } };
  }
  // Technische Fehler landen im Serverlog, der Benutzer bekommt eine klare Meldung.
  console.error('[HST Planer] Unerwarteter Fehler:', error);
  return {
    status: 500,
    body: { error: 'Es ist ein technischer Fehler aufgetreten. Bitte versuchen Sie es erneut.', code: 'FEHLER' },
  };
}
