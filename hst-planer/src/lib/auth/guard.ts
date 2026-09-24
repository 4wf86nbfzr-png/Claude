import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from './session';
import { can, type Permission } from './rbac';

/**
 * Zugriffspruefung für Seiten.
 *
 * Anders als `requirePermission` (für API-Routen) wird hier nicht geworfen,
 * sondern weitergeleitet: Wer nicht angemeldet ist, landet auf der
 * Anmeldeseite, wer kein Recht hat, auf einer verständlichen Hinweisseite.
 */
export async function seite(permission?: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/anmelden');
  if (permission && !can(user.role, permission)) redirect('/kein-zugriff');
  return user;
}
