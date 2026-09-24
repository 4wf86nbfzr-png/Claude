import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { formatDateDE } from '@/lib/time';
import { REQUEST_STATUS, label } from '@/lib/status';
import { Karte, Leer, Seitenkopf, StatusMarke } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';
import { Icon } from '@/components/icons';

export const metadata: Metadata = { title: 'Anfragen' };
export const dynamic = 'force-dynamic';

export default async function Anfragen({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('requests.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params);

  const where: Prisma.RequestWhereInput = { deletedAt: null };
  if (user.scope === 'KUNDE') where.customerId = user.customerId ?? '__kein_kunde__';
  if (params.q) {
    where.OR = [
      { reference: { contains: params.q, mode: 'insensitive' } },
      { company: { contains: params.q, mode: 'insensitive' } },
      { contactPerson: { contains: params.q, mode: 'insensitive' } },
      { email: { contains: params.q, mode: 'insensitive' } },
      { eventName: { contains: params.q, mode: 'insensitive' } },
      { location: { contains: params.q, mode: 'insensitive' } },
    ];
  }
  if (params.status) where.status = params.status as Prisma.RequestWhereInput['status'];
  if (params.quelle) where.channel = params.quelle.toUpperCase() as Prisma.RequestWhereInput['channel'];

  const [anfragen, gesamt] = await Promise.all([
    db.request.findMany({
      where,
      include: { customer: { select: { id: true, name: true } }, event: { select: { id: true, reference: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip, take: perPage,
    }),
    db.request.count({ where }),
  ]);

  return (
    <>
      <Seitenkopf
        titel="Anfragen"
        unter="Jede neue Anfrage ist zunächst ein Vorgang zur Prüfung – niemals eine Buchung."
        aktionen={can(user.role, 'requests.edit') && (
          <Link href="/anfragen/neu" className="knopf knopf-primaer"><Icon name="plus" /> Anfrage erfassen</Link>
        )}
      />

      <Karte>
        <Filterleiste
          platzhalter="Firma, Ansprechpartner, Nummer oder Ort …"
          felder={[
            { name: 'status', label: 'Status', optionen: Object.entries(REQUEST_STATUS).map(([wert, s]) => ({ wert, label: s.label })) },
            { name: 'quelle', label: 'Quelle', optionen: [
              { wert: 'website', label: 'Website' }, { wert: 'email', label: 'E-Mail' },
              { wert: 'api', label: 'API' }, { wert: 'telefon', label: 'Telefon' }, { wert: 'manuell', label: 'Manuell' },
            ] },
          ]}
        />

        {anfragen.length === 0 ? <Leer>Keine Anfragen gefunden.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr><th>Nummer</th><th>Firma / Kontakt</th><th>Anlass</th><th>Datum</th><th>Ort</th><th>Personal</th><th>Quelle</th><th>Status</th><th>Eingang</th></tr>
              </thead>
              <tbody>
                {anfragen.map((anfrage) => (
                  <tr key={anfrage.id} className={anfrage.status === 'NEU' ? 'zeile-gelb' : anfrage.status === 'UEBERNOMMEN' ? 'zeile-gruen' : undefined}>
                    <td className="zahl" style={{ fontSize: 12, color: 'var(--text-gedaempft)' }}>{anfrage.reference}</td>
                    <td>
                      <Link href={`/anfragen/${anfrage.id}`} style={{ fontWeight: 500 }}>{anfrage.company ?? anfrage.contactPerson ?? anfrage.email ?? 'ohne Angabe'}</Link>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>{anfrage.contactPerson ?? anfrage.email}</span>
                    </td>
                    <td>{anfrage.eventName ?? '–'}</td>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                      {anfrage.eventDate ? formatDateDE(anfrage.eventDate) : <span className="marke marke-gelb">fehlt</span>}
                    </td>
                    <td style={{ color: 'var(--text-sekundaer)' }}>{anfrage.location ?? '–'}</td>
                    <td className="zahl">{anfrage.employeesNeeded ?? <span className="marke marke-gelb">?</span>}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-sekundaer)' }}>{anfrage.channel}</td>
                    <td>
                      <StatusMarke status={label(REQUEST_STATUS, anfrage.status)} />
                      {anfrage.missingFields.length > 0 && anfrage.status === 'NEU' && (
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--gelb)', marginTop: 3 }}>
                          Angaben unvollständig
                        </span>
                      )}
                      {anfrage.event && (
                        <Link href={`/events/${anfrage.event.id}`} style={{ display: 'block', fontSize: 11 }}>{anfrage.event.reference}</Link>
                      )}
                    </td>
                    <td className="zahl" style={{ fontSize: 12, color: 'var(--text-sekundaer)' }}>{formatDateDE(anfrage.createdAt)}</td>
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
