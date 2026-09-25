import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { employeeFilter } from '@/lib/queries/scope';
import { EMPLOYMENT_TYPE } from '@/lib/status';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';

export const metadata: Metadata = { title: 'Mitarbeiterakten' };
export const dynamic = 'force-dynamic';

/**
 * Mitarbeiterakten (SecPlan 2, Bereich PERSONAL).
 *
 * Die Mitarbeiterliste beantwortet „wen haben wir?". Diese Seite
 * beantwortet „ist die Akte vollständig?" – also woran das Personalbüro
 * arbeitet: fehlender Arbeitsvertrag, fehlendes Führungszeugnis, keine
 * Löschfrist gesetzt. Deshalb hängt sie am Recht employees.file.
 */
export default async function Mitarbeiterakten({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('employees.file');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params, 30);

  const where: Prisma.EmployeeWhereInput = { ...employeeFilter(user) };
  if (params.q) {
    where.OR = [
      { firstName: { contains: params.q, mode: 'insensitive' } },
      { lastName: { contains: params.q, mode: 'insensitive' } },
      { personnelNo: { contains: params.q, mode: 'insensitive' } },
    ];
  }
  if (params.status === 'inaktiv') where.active = false;
  else if (params.status !== 'alle') where.active = true;

  const [personen, gesamt] = await Promise.all([
    db.employee.findMany({
      where,
      select: {
        id: true, personnelNo: true, firstName: true, lastName: true,
        employmentType: true, active: true, createdAt: true,
        documents: {
          where: { deletedAt: null },
          select: { type: true, expiresAt: true, deleteAt: true, retentionRuleId: true },
        },
        _count: { select: { qualifications: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip, take: perPage,
    }),
    db.employee.count({ where }),
  ]);

  const heute = new Date();

  /** Was in einer vollständigen Akte liegen muss. */
  const PFLICHT = [
    { typ: 'ARBEITSVERTRAG' as const, label: 'Vertrag' },
    { typ: 'FUEHRUNGSZEUGNIS' as const, label: 'Führungszeugnis' },
    { typ: 'AUSWEIS' as const, label: 'Ausweis' },
  ];

  const bewertet = personen.map((person) => {
    const fehlend = PFLICHT.filter((p) => !person.documents.some((d) => d.type === p.typ)).map((p) => p.label);
    const abgelaufen = person.documents.filter((d) => d.expiresAt && d.expiresAt < heute).length;
    const ohneFrist = person.documents.filter((d) => !d.deleteAt && !d.retentionRuleId).length;
    return { person, fehlend, abgelaufen, ohneFrist };
  });

  const unvollstaendig = bewertet.filter((b) => b.fehlend.length > 0).length;

  return (
    <>
      <Seitenkopf
        titel="Mitarbeiterakten"
        unter={`${gesamt.toLocaleString('de-DE')} Akten · Vollständigkeit und Fristen`}
      />

      <Raster min={160}>
        <Kennzahl wert={gesamt} label="Geführte Akten" />
        <Kennzahl wert={unvollstaendig} label="Unvollständig (auf dieser Seite)"
                  farbe={unvollstaendig > 0 ? 'gelb' : 'gruen'} />
        <Kennzahl wert={bewertet.reduce((s, b) => s + b.abgelaufen, 0)} label="Abgelaufene Unterlagen"
                  farbe={bewertet.some((b) => b.abgelaufen > 0) ? 'rot' : 'gruen'} />
        <Kennzahl wert={bewertet.reduce((s, b) => s + b.ohneFrist, 0)} label="Unterlagen ohne Frist"
                  hinweis="ohne Frist wird nichts gelöscht"
                  farbe={bewertet.some((b) => b.ohneFrist > 0) ? 'gelb' : 'gruen'} />
      </Raster>

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <Hinweis art="info">
          Die Prüfung ist eine Vollständigkeitskontrolle gegen die hinterlegten Pflichtunterlagen –
          keine rechtliche Bewertung. Ob eine Akte den Anforderungen genügt, entscheidet nicht
          dieses System.
        </Hinweis>
      </div>

      <Karte>
        <Filterleiste
          platzhalter="Name oder Personalnummer …"
          felder={[{ name: 'status', label: 'Status', optionen: [{ wert: 'alle', label: 'alle' }, { wert: 'inaktiv', label: 'nur inaktive' }] }]}
        />

        {bewertet.length === 0 ? (
          <Leer>Keine Akte gefunden.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Name</th><th>Personalnr.</th><th>Beschäftigung</th>
                  <th>Unterlagen</th><th>Fehlt</th><th>Abgelaufen</th><th>Ohne Frist</th><th>Qualifikationen</th>
                </tr>
              </thead>
              <tbody>
                {bewertet.map(({ person, fehlend, abgelaufen, ohneFrist }) => (
                  <tr key={person.id}
                      className={abgelaufen > 0 ? 'zeile-rot' : fehlend.length > 0 ? 'zeile-gelb' : 'zeile-gruen'}>
                    <td>
                      <Link href={`/mitarbeiter/${person.id}/datenschutz`} style={{ fontWeight: 500 }}>
                        {person.lastName}, {person.firstName}
                      </Link>
                      {!person.active && <span className="marke marke-grau" style={{ marginLeft: 5 }}>inaktiv</span>}
                    </td>
                    <td className="zahl" style={{ color: 'var(--text-3)' }}>{person.personnelNo}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      {EMPLOYMENT_TYPE[person.employmentType] ?? person.employmentType}
                    </td>
                    <td className="zahl">{person.documents.length}</td>
                    <td style={{ fontSize: 11 }}>
                      {fehlend.length === 0
                        ? <span className="marke marke-gruen">vollständig</span>
                        : fehlend.map((f) => <span key={f} className="marke marke-gelb" style={{ marginRight: 3 }}>{f}</span>)}
                    </td>
                    <td className="zahl">
                      {abgelaufen > 0 ? <span className="marke marke-rot">{abgelaufen}</span> : '–'}
                    </td>
                    <td className="zahl">
                      {ohneFrist > 0 ? <span className="marke marke-gelb">{ohneFrist}</span> : '–'}
                    </td>
                    <td className="zahl">{person._count.qualifications}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Blaettern seite={page} proSeite={perPage} gesamt={gesamt} />
      </Karte>
    </>
  );
}
