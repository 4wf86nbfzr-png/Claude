import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import { Seitenkopf } from '@/components/ui';
import { MitarbeiterFormular } from '../../mitarbeiter-formular';

export const metadata = { title: 'Mitarbeiter bearbeiten' };
export const dynamic = 'force-dynamic';

export default async function MitarbeiterBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('employees.edit');
  const { id } = await params;

  const [employee, partner, qualifikationen, bereiche] = await Promise.all([
    db.employee.findFirst({ where: { id, ...employeeFilter(user) }, include: { qualifications: true } }),
    db.partner.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.qualification.findMany({ where: { active: true }, select: { id: true, name: true, expires: true }, orderBy: { name: 'asc' } }),
    db.serviceType.findMany({ where: { active: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  if (!employee) notFound();

  return (
    <>
      <Seitenkopf titel={`${employee.firstName} ${employee.lastName}`}
                  brotkrumen={[{ href: '/mitarbeiter', label: 'Mitarbeiter' }, { href: `/mitarbeiter/${id}`, label: employee.personnelNo }]} />
      <MitarbeiterFormular
        werte={{
          id: employee.id, firstName: employee.firstName, lastName: employee.lastName,
          personnelNo: employee.personnelNo, phone: employee.phone, mobile: employee.mobile, email: employee.email,
          street: employee.street, zip: employee.zip, city: employee.city,
          birthDate: employee.birthDate ? employee.birthDate.toISOString().slice(0, 10) : null,
          employmentType: employee.employmentType,
          hourlyRate: employee.hourlyRate ? String(employee.hourlyRate) : null,
          drivingLicence: employee.drivingLicence, partnerId: employee.partnerId,
          active: employee.active, blocked: employee.blocked, blockReason: employee.blockReason,
          notesInternal: employee.notesInternal, infoForEmployee: employee.infoForEmployee,
          preferredAreas: employee.preferredAreas,
          qualifikationen: employee.qualifications.map((q) => ({
            qualificationId: q.qualificationId,
            acquiredAt: q.acquiredAt ? q.acquiredAt.toISOString().slice(0, 10) : null,
            expiresAt: q.expiresAt ? q.expiresAt.toISOString().slice(0, 10) : null,
          })),
        }}
        partner={partner} qualifikationen={qualifikationen} bereiche={bereiche}
        darfFinanzen={can(user.role, 'finance.view')}
      />
    </>
  );
}
