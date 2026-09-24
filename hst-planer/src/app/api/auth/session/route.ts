import { ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/session';
import { navFor, ROLE_LABEL } from '@/lib/auth/rbac';

/** Wer bin ich? Liefert Rolle, Sichtbarkeit und die erlaubte Navigation. */
export const GET = route(async () => {
  const user = await requireUser();
  return ok({
    id: user.id, name: user.name, email: user.email,
    rolle: user.role, rolleLabel: ROLE_LABEL[user.role], sichtbarkeit: user.scope,
    mitarbeiterId: user.employeeId, partnerId: user.partnerId, kundeId: user.customerId,
    navigation: navFor(user.role).map((n) => ({ href: n.href, label: n.label })),
  });
});
