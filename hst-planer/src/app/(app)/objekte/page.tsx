import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { Hinweis, Karte, Leer, Seitenkopf } from '@/components/ui';
import { Filterleiste } from '@/components/filter';

export const metadata: Metadata = { title: 'Objekte' };
export const dynamic = 'force-dynamic';

/**
 * Objekte (SecPlan 2, Bereich EINSÄTZE).
 *
 * Ein Objekt ist ein dauerhaft betreuter Standort – Werkschutz, Empfang,
 * Revier. Der Unterschied zur Veranstaltung: es hat kein Enddatum und
 * einen festen Objektleiter. Einsätze an einem Objekt hängen weiterhin
 * als Event daran, damit Planung und Abrechnung gleich bleiben.
 */
export default async function Objekte({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await seite('objects.view');
  const params = await searchParams;

  const where: Prisma.ObjektWhereInput = { deletedAt: null };
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: 'insensitive' } },
      { city: { contains: params.q, mode: 'insensitive' } },
      { street: { contains: params.q, mode: 'insensitive' } },
    ];
  }
  if (params.status === 'inaktiv') where.active = false;
  else if (params.status !== 'alle') where.active = true;

  const [objekte, kunden] = await Promise.all([
    db.objekt.findMany({
      where,
      select: {
        id: true, name: true, shortName: true, street: true, zip: true, city: true,
        active: true, serviceNote: true, leadId: true,
        customer: { select: { id: true, name: true } },
        _count: { select: { events: { where: { deletedAt: null } } } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  const leiter = await db.employee.findMany({
    where: { id: { in: [...new Set(objekte.map((o) => o.leadId).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, firstName: true, lastName: true, mobile: true },
  });
  const leiterVon = new Map(leiter.map((l) => [l.id, l]));

  return (
    <>
      <Seitenkopf titel="Objekte" unter={`${objekte.length} Standorte in dauerhafter Betreuung`} />

      {objekte.length === 0 && !params.q && (
        <div style={{ marginBottom: 12 }}>
          <Hinweis art="info">
            Es ist noch kein Objekt angelegt. Solange alles über Veranstaltungen läuft, wird
            diese Seite nicht gebraucht – sie ist für den Tag da, an dem ein Dauerauftrag
            dazukommt.
          </Hinweis>
        </div>
      )}

      <Karte>
        <Filterleiste
          platzhalter="Name, Straße oder Ort …"
          felder={[
            { name: 'kunde', label: 'Kunde', optionen: kunden.map((k) => ({ wert: k.id, label: k.name })) },
            { name: 'status', label: 'Status', optionen: [{ wert: 'alle', label: 'alle' }, { wert: 'inaktiv', label: 'nur inaktive' }] },
          ]}
        />

        {objekte.length === 0 ? (
          <Leer>Kein Objekt gefunden.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr><th>Objekt</th><th>Kunde</th><th>Anschrift</th><th>Objektleitung</th><th>Einsätze</th><th>Leistung</th></tr>
              </thead>
              <tbody>
                {objekte.map((objekt) => {
                  const lead = objekt.leadId ? leiterVon.get(objekt.leadId) : null;
                  return (
                    <tr key={objekt.id} className={objekt.active ? undefined : 'zeile-grau'}>
                      <td style={{ fontWeight: 500 }}>
                        {objekt.name}
                        {objekt.shortName && <span style={{ color: 'var(--text-3)' }}> ({objekt.shortName})</span>}
                        {!objekt.active && <span className="marke marke-grau" style={{ marginLeft: 5 }}>inaktiv</span>}
                      </td>
                      <td>{objekt.customer ? <Link href={`/kunden/${objekt.customer.id}`}>{objekt.customer.name}</Link> : '–'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        {[objekt.street, [objekt.zip, objekt.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {lead
                          ? <Link href={`/mitarbeiter/${lead.id}`}>{lead.lastName}, {lead.firstName}</Link>
                          : <span className="marke marke-gelb">nicht benannt</span>}
                      </td>
                      <td className="zahl">{objekt._count.events}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{objekt.serviceNote ?? '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </>
  );
}
