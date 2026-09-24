import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { Seitenkopf } from '@/components/ui';
import { PartnerFormular } from '../../partner-formular';

export const metadata = { title: 'Partner bearbeiten' };
export const dynamic = 'force-dynamic';

export default async function PartnerBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('partners.edit');
  const { id } = await params;
  const partner = await db.partner.findFirst({ where: { id, deletedAt: null } });
  if (!partner) notFound();

  return (
    <>
      <Seitenkopf titel={partner.name} brotkrumen={[{ href: '/partner', label: 'Partner' }, { href: `/partner/${id}`, label: 'Detail' }]} />
      <PartnerFormular
        werte={{
          id: partner.id, name: partner.name, contactName: partner.contactName,
          email: partner.email, phone: partner.phone, street: partner.street,
          zip: partner.zip, city: partner.city,
          hourlyRate: partner.hourlyRate ? String(partner.hourlyRate) : null,
          notesInternal: partner.notesInternal, active: partner.active,
        }}
        darfFinanzen={can(user.role, 'finance.view')}
      />
    </>
  );
}
