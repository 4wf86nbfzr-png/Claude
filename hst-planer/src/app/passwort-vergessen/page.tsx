import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { homeFor } from '@/lib/auth/rbac';
import { Logo } from '@/components/logo';
import { VergessenFormular } from './formular';

export const metadata: Metadata = { title: 'Passwort vergessen' };
export const dynamic = 'force-dynamic';

export default async function PasswortVergessen() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20, background: 'var(--flaeche)' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 26 }}>
          <Logo groesse={40} />
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-.01em', margin: 0 }}>Passwort vergessen</h1>
          </div>
        </div>

        <div className="karte" style={{ padding: 20 }}>
          <VergessenFormular />
        </div>
      </div>
    </main>
  );
}
