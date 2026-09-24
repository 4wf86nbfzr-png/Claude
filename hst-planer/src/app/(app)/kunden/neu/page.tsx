import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { Seitenkopf } from '@/components/ui';
import { KundenFormular } from '../kunden-formular';

export const metadata = { title: 'Neuer Kunde' };

export default async function NeuerKunde() {
  const user = await seite('customers.edit');
  return (
    <>
      <Seitenkopf titel="Neuer Kunde" brotkrumen={[{ href: '/kunden', label: 'Kunden' }]} />
      <KundenFormular darfFinanzen={can(user.role, 'finance.view')} />
    </>
  );
}
