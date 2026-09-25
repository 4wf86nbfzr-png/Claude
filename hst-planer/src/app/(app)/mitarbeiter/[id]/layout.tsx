import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can, personenfelder } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import { EMPLOYMENT_TYPE } from '@/lib/status';
import { Reiter, type ReiterEintrag } from '@/components/reiter';

/**
 * Mitarbeiterakte (SecPlan 5).
 *
 * Sieben Reiter: Übersicht, Einsätze, Qualifikationen, Dokumente,
 * Arbeitszeiten, Kommunikation, Datenschutz. Der letzte ist ausdrücklich
 * eingeschränkt und erscheint nur, wenn die Rolle ihn führen darf.
 *
 * Die Kopfzeile trägt bewusst wenig: Name, Personalnummer, Status. Alles
 * Weitere steht im passenden Reiter, damit nicht jede Rolle beim Öffnen
 * der Akte sofort alles sieht.
 */
export default async function AktenLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await seite('employees.view');
  const { id } = await params;
  const felder = personenfelder(user.role);

  const employee = await db.employee.findFirst({
    where: { id, ...employeeFilter(user) },
    select: {
      id: true, firstName: true, lastName: true, personnelNo: true,
      employmentType: true, active: true, blocked: true, blockReason: true,
      partner: { select: { id: true, name: true } },
      _count: {
        select: {
          assignments: { where: { deletedAt: null } },
          qualifications: true,
          documents: { where: { deletedAt: null } },
        },
      },
    },
  });
  if (!employee) notFound();

  const basis = `/mitarbeiter/${id}`;
  const eintraege: ReiterEintrag[] = [
    { href: basis, label: 'Übersicht' },
    { href: `${basis}/einsaetze`, label: 'Einsätze', zahl: employee._count.assignments },
    { href: `${basis}/qualifikationen`, label: 'Qualifikationen', zahl: employee._count.qualifications },
  ];
  if (can(user.role, 'documents.view')) {
    eintraege.push({ href: `${basis}/dokumente`, label: 'Dokumente', zahl: employee._count.documents });
  }
  if (can(user.role, 'timesheets.view')) {
    eintraege.push({ href: `${basis}/arbeitszeiten`, label: 'Arbeitszeiten' });
  }
  if (can(user.role, 'communication.view')) {
    eintraege.push({ href: `${basis}/kommunikation`, label: 'Kommunikation' });
  }
  // SecPlan 5: der Datenschutz-Reiter ist eingeschränkt. Er erscheint nur
  // für Rollen, die Personalakten führen – sonst steht er gar nicht da.
  if (can(user.role, 'employees.file')) {
    eintraege.push({ href: `${basis}/datenschutz`, label: 'Datenschutz' });
  }

  return (
    <>
      <header style={{ marginBottom: 10 }}>
        <nav aria-label="Brotkrumen" className="brotkrumen">
          <Link href="/mitarbeiter">Mitarbeiter</Link>
          <span aria-hidden>/</span>
          <span className="zahl">{felder.stammdaten ? employee.personnelNo : '–'}</span>
        </nav>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-.01em', margin: 0 }}>
            {employee.lastName}, {employee.firstName}
          </h1>
          {felder.stammdaten && (
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {EMPLOYMENT_TYPE[employee.employmentType] ?? employee.employmentType}
            </span>
          )}
          {employee.partner && (
            <Link href={`/partner/${employee.partner.id}`} className="marke marke-blau">{employee.partner.name}</Link>
          )}
          {!employee.active && <span className="marke marke-grau">inaktiv</span>}
          {employee.blocked && (
            <span className="marke marke-rot">
              Sperrvermerk{felder.notizen && employee.blockReason ? `: ${employee.blockReason}` : ''}
            </span>
          )}
          {can(user.role, 'employees.edit') && (
            <Link href={`${basis}/bearbeiten`} className="knopf knopf-klein" style={{ marginLeft: 'auto' }}>
              Bearbeiten
            </Link>
          )}
        </div>
      </header>

      <Reiter eintraege={eintraege} basis={basis} />
      {children}
    </>
  );
}
