import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { homeFor } from '@/lib/auth/rbac';

export default async function Start() {
  const user = await getSessionUser();
  redirect(user ? homeFor(user.role) : '/anmelden');
}
