import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { Seitenkopf } from '@/components/ui';
import { KundenFormular } from '../../kunden-formular';

export const metadata = { title: 'Kunde bearbeiten' };
export const dynamic = 'force-dynamic';

export default async function KundeBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('customers.edit');
  const { id } = await params;
  const kunde = await db.customer.findFirst({ where: { id, deletedAt: null } });
  if (!kunde) notFound();

  return (
    <>
      <Seitenkopf titel={kunde.name} brotkrumen={[{ href: '/kunden', label: 'Kunden' }, { href: `/kunden/${id}`, label: 'Detail' }]} />
      <KundenFormular
        werte={{
          id: kunde.id, name: kunde.name, shortName: kunde.shortName, email: kunde.email, phone: kunde.phone,
          street: kunde.street, zip: kunde.zip, city: kunde.city, billingAddress: kunde.billingAddress,
          vatId: kunde.vatId, hourlyRate: kunde.hourlyRate ? String(kunde.hourlyRate) : null,
          contractNote: kunde.contractNote, notesInternal: kunde.notesInternal, active: kunde.active,
        }}
        darfFinanzen={can(user.role, 'finance.view')}
      />
    </>
  );
}
