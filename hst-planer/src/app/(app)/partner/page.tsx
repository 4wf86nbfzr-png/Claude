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

export const metadata: Metadata = { title: 'Partner' };
export const dynamic = 'force-dynamic';

export default async function Partner({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('partners.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params);

  const where: Prisma.PartnerWhereInput = { deletedAt: null };
  if (user.scope === 'PARTNER') where.id = user.partnerId ?? '__kein_partner__';
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: 'insensitive' } },
      { contactName: { contains: params.q, mode: 'insensitive' } },
      { city: { contains: params.q, mode: 'insensitive' } },
    ];
  }

  const [partner, gesamt] = await Promise.all([
    db.partner.findMany({
      where,
      include: { _count: { select: { employees: { where: { deletedAt: null } }, assignments: { where: { deletedAt: null } } } } },
      orderBy: { name: 'asc' }, skip, take: perPage,
    }),
    db.partner.count({ where }),
  ]);

  return (
    <>
      <Seitenkopf titel="Partner & Nachunternehmer" unter={`${gesamt} Einträge`}
                  aktionen={can(user.role, 'partners.edit') && (
                    <Link href="/partner/neu" className="knopf knopf-primaer"><Icon name="plus" /> Neuer Partner</Link>
                  )} />
      <Karte>
        <Filterleiste platzhalter="Firma, Ansprechpartner, Ort …" />
        {partner.length === 0 ? <Leer>Keine Partner hinterlegt.</Leer> : (
          <table className="tabelle">
            <thead><tr><th>Firma</th><th>Ansprechpartner</th><th>Ort</th><th>Kontakt</th><th>Kräfte</th><th>Einsätze</th></tr></thead>
            <tbody>
              {partner.map((p) => (
                <tr key={p.id} className={p.active ? undefined : 'zeile-grau'}>
                  <td>
                    <Link href={`/partner/${p.id}`} style={{ fontWeight: 500 }}>{p.name}</Link>
                    {!p.active && <span className="marke marke-grau" style={{ marginLeft: 6 }}>inaktiv</span>}
                  </td>
                  <td style={{ color: 'var(--text-sekundaer)' }}>{p.contactName ?? '–'}</td>
                  <td style={{ color: 'var(--text-sekundaer)' }}>{p.city ?? '–'}</td>
                  <td style={{ fontSize: 12 }}>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : p.phone ?? '–'}</td>
                  <td className="zahl">{p._count.employees}</td>
                  <td className="zahl">{p._count.assignments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Blaettern seite={page} proSeite={perPage} gesamt={gesamt} />
      </Karte>
    </>
  );
}
