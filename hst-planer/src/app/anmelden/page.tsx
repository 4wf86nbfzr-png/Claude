import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth/session';
import { homeFor } from '@/lib/auth/rbac';
import { Logo } from '@/components/logo';
import { AnmeldeFormular } from './formular';

export const metadata: Metadata = { title: 'Anmelden' };

export default async function AnmeldenSeite() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20, background: 'var(--flaeche)' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 26 }}>
          <Logo groesse={40} />
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-.01em', margin: 0 }}>HST Planer</h1>
            <p style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '4px 0 0' }}>
              Disposition &amp; Einsatzsteuerung
            </p>
          </div>
        </div>

        <div className="karte" style={{ padding: 20 }}>
          <AnmeldeFormular />
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 16 }}>
          HERM Service Team e.K. · Zugang nur für berechtigte Personen
        </p>
      </div>
    </main>
  );
}
