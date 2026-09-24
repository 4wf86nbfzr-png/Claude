import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { Seitenkopf } from '@/components/ui';
import { MitarbeiterFormular } from '../mitarbeiter-formular';

export const metadata = { title: 'Neuer Mitarbeiter' };

export default async function NeuerMitarbeiter() {
  const user = await seite('employees.edit');
  const [partner, qualifikationen, bereiche] = await Promise.all([
    db.partner.findMany({ where: { deletedAt: null, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.qualification.findMany({ where: { active: true }, select: { id: true, name: true, expires: true }, orderBy: { name: 'asc' } }),
    db.serviceType.findMany({ where: { active: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <>
      <Seitenkopf titel="Neuer Mitarbeiter" brotkrumen={[{ href: '/mitarbeiter', label: 'Mitarbeiter' }]} />
      <MitarbeiterFormular partner={partner} qualifikationen={qualifikationen} bereiche={bereiche} darfFinanzen={can(user.role, 'finance.view')} />
    </>
  );
}
