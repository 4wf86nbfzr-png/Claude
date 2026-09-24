import 'server-only';
import { getSessionUser, type SessionUser } from './auth/session';
import { requireApiKey, type ApiCaller } from './auth/apikey';
import { AuthError, ForbiddenError } from './errors';
import { can, type Permission } from './auth/rbac';

/**
 * Zugang zur REST-API (Spec 41).
 *
 * Zwei Wege sind erlaubt:
 *   * angemeldete Sitzung (die Oberflaeche selbst, aber auch Skripte nach Login)
 *   * API-Schluessel im Header `Authorization: Bearer hst_…` bzw. `x-api-key`
 *
 * Ein Schluessel hat immer den vollen Lesezugriff seines Bereichs; Rollen
 * und Sichtbarkeitsgrenzen gelten nur fuer angemeldete Benutzer.
 */
export interface ApiZugang {
  art: 'SITZUNG' | 'SCHLUESSEL';
  benutzer: SessionUser | null;
  schluessel: ApiCaller | null;
}

export async function apiZugang(request: Request, permission: Permission, scope?: string): Promise<ApiZugang> {
  const benutzer = await getSessionUser();
  if (benutzer) {
    if (!can(benutzer.role, permission)) throw new ForbiddenError();
    return { art: 'SITZUNG', benutzer, schluessel: null };
  }

  const hatSchluessel = request.headers.get('authorization') || request.headers.get('x-api-key');
  if (!hatSchluessel) throw new AuthError('Bitte melden Sie sich an oder senden Sie einen API-Schluessel.');

  const schluessel = await requireApiKey(request, scope);
  return { art: 'SCHLUESSEL', benutzer: null, schluessel };
}
