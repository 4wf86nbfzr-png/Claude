import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { Karte, Leer, Seitenkopf } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';
import { Icon } from '@/components/icons';

export const metadata: Metadata = { title: 'Kunden' };
export const dynamic = 'force-dynamic';

export default async function Kunden({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('customers.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params);

  const where: Prisma.CustomerWhereInput = { deletedAt: null };
  if (user.scope === 'KUNDE') where.id = user.customerId ?? '__kein_kunde__';
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: 'insensitive' } },
      { shortName: { contains: params.q, mode: 'insensitive' } },
      { city: { contains: params.q, mode: 'insensitive' } },
      { email: { contains: params.q, mode: 'insensitive' } },
      { contacts: { some: { name: { contains: params.q, mode: 'insensitive' } } } },
    ];
  }
  if (params.status !== 'alle') where.active = params.status === 'inaktiv' ? false : true;

  const [kunden, gesamt] = await Promise.all([
    db.customer.findMany({
      where,
      include: {
        contacts: { where: { primary: true }, take: 1 },
        _count: { select: { events: { where: { deletedAt: null } } } },
      },
      orderBy: { name: 'asc' },
      skip, take: perPage,
    }),
    db.customer.count({ where }),
  ]);

  return (
    <>
      <Seitenkopf titel="Kunden" unter={`${gesamt} Eintraege`}
                  aktionen={can(user.role, 'customers.edit') && (
                    <Link href="/kunden/neu" className="knopf knopf-primaer"><Icon name="plus" /> Neuer Kunde</Link>
                  )} />

      <Karte>
        <Filterleiste
          platzhalter="Firma, Ort, Ansprechpartner …"
          felder={[{ name: 'status', label: 'Status', optionen: [{ wert: 'alle', label: 'alle' }, { wert: 'inaktiv', label: 'inaktiv' }] }]}
        />
        {kunden.length === 0 ? <Leer>Keine Kunden gefunden.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Firma</th><th>Ansprechpartner</th><th>Ort</th><th>Kontakt</th><th>Events</th></tr></thead>
              <tbody>
                {kunden.map((kunde) => (
                  <tr key={kunde.id} className={kunde.active ? undefined : 'zeile-grau'}>
                    <td>
                      <Link href={`/kunden/${kunde.id}`} style={{ fontWeight: 500 }}>{kunde.name}</Link>
                      {!kunde.active && <span className="marke marke-grau" style={{ marginLeft: 6 }}>inaktiv</span>}
                    </td>
                    <td style={{ color: 'var(--text-sekundaer)' }}>{kunde.contacts[0]?.name ?? '–'}</td>
                    <td style={{ color: 'var(--text-sekundaer)' }}>{kunde.city ?? '–'}</td>
                    <td style={{ fontSize: 12 }}>
                      {kunde.email ? <a href={`mailto:${kunde.email}`}>{kunde.email}</a> : kunde.phone ?? '–'}
                    </td>
                    <td className="zahl">{kunde._count.events}</td>
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
