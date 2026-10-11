/**
 * Einheitliche Fehlerklassen. Die API- und UI-Schicht bilden sie auf
 * HTTP-Status und verständliche Meldungen ab; Interna bleiben verborgen.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(message: string, status = 500, code = "internal_error", details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Ungültige Eingabe", details?: unknown) {
    super(message, 400, "validation_error", details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "Anmeldung erforderlich") {
    super(message, 401, "unauthorized");
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "Keine Berechtigung für diese Aktion") {
    super(message, 403, "forbidden");
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Nicht gefunden") {
    super(message, 404, "not_found");
  }
}
export class ConflictError extends AppError {
  constructor(message = "Konflikt", details?: unknown) {
    super(message, 409, "conflict", details);
  }
}
export class RateLimitError extends AppError {
  constructor(message = "Zu viele Anfragen, bitte später erneut versuchen") {
    super(message, 429, "rate_limited");
  }
}
export class ReauthRequiredError extends AppError {
  constructor(message = "Bitte Passwort erneut bestätigen") {
    super(message, 403, "reauth_required");
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
