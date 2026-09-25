import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { Seitenkopf } from '@/components/ui';
import { PartnerFormular } from '../partner-formular';

export const metadata = { title: 'Neuer Partner' };

export default async function NeuerPartner() {
  const user = await seite('partners.edit');
  return (
    <>
      <Seitenkopf titel="Neuer Partner" brotkrumen={[{ href: '/partner', label: 'Partner' }]} />
      <PartnerFormular darfFinanzen={can(user.role, 'finance.view')} />
    </>
  );
}
