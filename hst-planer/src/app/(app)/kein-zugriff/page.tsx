import Link from 'next/link';
import { seite } from '@/lib/auth/guard';
import { homeFor, ROLE_LABEL } from '@/lib/auth/rbac';
import { Karte } from '@/components/ui';

export const metadata = { title: 'Kein Zugriff' };

export default async function KeinZugriff() {
  const user = await seite();
  return (
    <Karte klasse="druck-block">
      <div style={{ padding: 28, maxWidth: 520 }}>
        <h1 style={{ fontSize: 18, fontWeight: 650, margin: '0 0 8px' }}>Fuer diesen Bereich fehlt Ihnen die Berechtigung</h1>
        <p style={{ color: 'var(--text-sekundaer)', margin: '0 0 16px' }}>
          Ihr Zugang ist als <strong>{ROLE_LABEL[user.role]}</strong> eingerichtet. Wenn Sie diesen Bereich
          fuer Ihre Arbeit brauchen, wenden Sie sich bitte an die Disposition oder die Administration.
        </p>
        <Link href={homeFor(user.role)} className="knopf knopf-primaer">Zurueck zur Startseite</Link>
      </div>
    </Karte>
  );
}
