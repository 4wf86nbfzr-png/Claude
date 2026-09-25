import { NextResponse } from 'next/server';
import { route } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import { alsCsv, alsExcel, dateiname, EXCEL_TYP, type Spalte } from '@/lib/export/excel';
import { filterAusUrl, protokolliereExport } from '@/lib/export/protokoll';
import { EMPLOYMENT_TYPE } from '@/lib/status';

export const GET = route(async (request: Request) => {
  const user = await requirePermission('employees.view');
  const format = new URL(request.url).searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';

  const mitarbeiter = await db.employee.findMany({
    where: employeeFilter(user),
    include: {
      partner: { select: { name: true } },
      qualifications: { include: { qualification: { select: { code: true } } } },
      _count: { select: { assignments: { where: { deletedAt: null } } } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 20000,
  });

  await protokolliereExport(user, {
    bereich: 'mitarbeiter',
    format: format === 'csv' ? 'CSV' : 'XLSX',
    rowCount: mitarbeiter.length,
    filter: filterAusUrl(request.url),
  });

  type Zeile = (typeof mitarbeiter)[number];
  const spalten: Array<Spalte<Zeile>> = [
    { titel: 'Personalnummer', wert: (m) => m.personnelNo, breite: 16 },
    { titel: 'Nachname', wert: (m) => m.lastName, breite: 20 },
    { titel: 'Vorname', wert: (m) => m.firstName, breite: 18 },
    { titel: 'Beschäftigung', wert: (m) => EMPLOYMENT_TYPE[m.employmentType] ?? m.employmentType, breite: 18 },
    { titel: 'Mobil', wert: (m) => m.mobile ?? '', breite: 18 },
    { titel: 'E-Mail', wert: (m) => m.email ?? '', breite: 28 },
    { titel: 'PLZ', wert: (m) => m.zip ?? '', breite: 8 },
    { titel: 'Ort', wert: (m) => m.city ?? '', breite: 20 },
    { titel: 'Partner', wert: (m) => m.partner?.name ?? '', breite: 24 },
    { titel: 'Qualifikationen', wert: (m) => m.qualifications.map((q) => q.qualification.code).join(', '), breite: 30 },
    { titel: 'Einsätze', wert: (m) => m._count.assignments, breite: 10 },
    { titel: 'Aktiv', wert: (m) => (m.active ? 'ja' : 'nein'), breite: 8 },
    { titel: 'Sperrvermerk', wert: (m) => (m.blocked ? m.blockReason ?? 'ja' : ''), breite: 24 },
  ];

  if (format === 'csv') {
    return new NextResponse(alsCsv(spalten, mitarbeiter), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${dateiname('hst-mitarbeiter').replace('.xlsx', '.csv')}"` },
    });
  }

  const puffer = await alsExcel('Mitarbeiter', spalten, mitarbeiter, ['HST Planer – Mitarbeiter', `Stand: ${new Date().toLocaleString('de-DE')}`]);
  return new NextResponse(new Uint8Array(puffer), {
    headers: { 'content-type': EXCEL_TYP, 'content-disposition': `attachment; filename="${dateiname('hst-mitarbeiter')}"` },
  });
});
