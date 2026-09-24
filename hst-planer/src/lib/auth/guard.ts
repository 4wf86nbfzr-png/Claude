import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from './session';
import { can, type Permission } from './rbac';

/**
 * Zugriffspruefung fuer Seiten.
 *
 * Anders als `requirePermission` (fuer API-Routen) wird hier nicht geworfen,
 * sondern weitergeleitet: Wer nicht angemeldet ist, landet auf der
 * Anmeldeseite, wer kein Recht hat, auf einer verstaendlichen Hinweisseite.
 */
export async function seite(permission?: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/anmelden');
  if (permission && !can(user.role, permission)) redirect('/kein-zugriff');
  return user;
}
