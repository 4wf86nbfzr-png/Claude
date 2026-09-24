'use server';

import { redirect } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { checkPasswordStrength, hashPassword, verifyPassword } from '@/lib/auth/password';
import { homeFor } from '@/lib/auth/rbac';
import { toPublicError, ValidationError } from '@/lib/errors';

export interface Ergebnis { fehler?: string; hinweis?: string }

export async function passwortAendern(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  let ziel = '/dashboard';
  try {
    const user = await seite();
    const alt = String(formData.get('alt') ?? '');
    const neu = String(formData.get('neu') ?? '');
    const wiederholung = String(formData.get('wiederholung') ?? '');

    if (neu !== wiederholung) throw new ValidationError('Die beiden neuen Passwoerter stimmen nicht ueberein.');
    const staerke = checkPasswordStrength(neu);
    if (!staerke.ok) throw new ValidationError(staerke.message!);

    const konto = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(alt, konto.passwordHash))) {
      throw new ValidationError('Das bisherige Passwort ist nicht korrekt.');
    }
    if (await verifyPassword(neu, konto.passwordHash)) {
      throw new ValidationError('Bitte waehlen Sie ein anderes als Ihr bisheriges Passwort.');
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(neu), mustChangePassword: false },
    });
    // Alle anderen Sitzungen beenden – ein Passwortwechsel soll wirken.
    await db.session.updateMany({
      where: { userId: user.id, id: { not: user.sessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(user, { action: 'user.password', entity: 'User', entityId: user.id, summary: `${user.name} hat das Passwort geaendert` });
    ziel = homeFor(user.role);
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { fehler: toPublicError(error).body.error };
  }
  redirect(ziel);
}
