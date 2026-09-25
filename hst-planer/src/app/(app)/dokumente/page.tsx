import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { formatDateDE, toDateOnly } from '@/lib/time';
import { DOCUMENT_TYPE } from '@/lib/status';
import { Karte, Leer, Seitenkopf } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';
import { AktionsFormular, AktionsKnopf } from '@/components/aktion';
import { dokumentEntfernenAktion } from './actions';
import { UploadFormular } from './upload';

export const metadata: Metadata = { title: 'Dokumente' };
export const dynamic = 'force-dynamic';

export default async function Dokumente({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('documents.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params);
  const heute = toDateOnly(new Date());

  const where: Prisma.DocumentWhereInput = { deletedAt: null };
  if (user.scope === 'EIGENE') where.AND = [{ employeeId: user.employeeId ?? '__keiner__' }, { visibleToEmployee: true }];
  if (user.scope === 'PARTNER') where.OR = [{ partnerId: user.partnerId ?? '__kein_partner__' }, { employee: { partnerId: user.partnerId ?? '__kein_partner__' } }];
  if (user.scope === 'KUNDE') where.OR = [{ customerId: user.customerId ?? '__kein_kunde__' }, { event: { customerId: user.customerId ?? '__kein_kunde__' } }];
  if (params.typ) where.type = params.typ as Prisma.DocumentWhereInput['type'];
  if (params.mitarbeiter) where.employeeId = params.mitarbeiter;
  if (params.ablauf === 'bald') where.expiresAt = { gte: heute, lte: new Date(heute.getTime() + 30 * 86400000) };
  if (params.ablauf === 'abgelaufen') where.expiresAt = { lt: heute };
  if (params.q) where.title = { contains: params.q, mode: 'insensitive' };

  const [dokumente, gesamt, mitarbeiter, kunden, events, partner] = await Promise.all([
    db.document.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        customer: { select: { id: true, name: true } },
        event: { select: { id: true, name: true } },
        partner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' }, skip, take: perPage,
    }),
    db.document.count({ where }),
    db.employee.findMany({ where: { deletedAt: null, active: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } }),
    db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.event.findMany({ where: { deletedAt: null, date: { gte: new Date(heute.getTime() - 120 * 86400000) } }, select: { id: true, name: true, date: true }, orderBy: { date: 'desc' }, take: 120 }),
    db.partner.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  const darfBearbeiten = can(user.role, 'documents.edit');
  const vorauswahl = { employeeId: params.mitarbeiter, eventId: params.event, customerId: params.kunde, partnerId: params.partner };

  return (
    <>
      <Seitenkopf titel="Dokumente" unter={`${gesamt} Dateien`} />

      {darfBearbeiten && (
        <div style={{ marginBottom: 16 }}>
          <Karte titel="Dokument hochladen">
            <div style={{ padding: 16 }}>
              <UploadFormular
                mitarbeiter={mitarbeiter.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}` }))}
                kunden={kunden}
                events={events.map((e) => ({ id: e.id, name: `${formatDateDE(e.date)} · ${e.name}` }))}
                partner={partner}
                vorauswahl={vorauswahl}
              />
            </div>
          </Karte>
        </div>
      )}

      <Karte>
        <Filterleiste
          platzhalter="Titel suchen …"
          felder={[
            { name: 'typ', label: 'Typ', optionen: Object.entries(DOCUMENT_TYPE).map(([wert, label]) => ({ wert, label })) },
            { name: 'ablauf', label: 'Gültigkeit', optionen: [{ wert: 'bald', label: 'läuft bald ab' }, { wert: 'abgelaufen', label: 'abgelaufen' }] },
          ]}
        />
        {dokumente.length === 0 ? <Leer>Keine Dokumente gefunden.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr><th>Titel</th><th>Typ</th><th>Zuordnung</th><th>Gültig bis</th><th>Größe</th><th>Hochgeladen</th><th style={{ width: 1 }} /></tr>
              </thead>
              <tbody>
                {dokumente.map((dokument) => {
                  const abgelaufen = dokument.expiresAt && dokument.expiresAt < heute;
                  const laeuftAb = dokument.expiresAt && !abgelaufen && dokument.expiresAt < new Date(heute.getTime() + 30 * 86400000);
                  return (
                    <tr key={dokument.id} className={abgelaufen ? 'zeile-rot' : laeuftAb ? 'zeile-gelb' : undefined}>
                      <td>
                        <a href={`/api/dokumente/${dokument.id}`} style={{ fontWeight: 500 }}>{dokument.title}</a>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{dokument.fileName}</span>
                      </td>
                      <td style={{ fontSize: 12 }}>{DOCUMENT_TYPE[dokument.type] ?? dokument.type}</td>
                      <td style={{ fontSize: 12 }}>
                        {dokument.employee && <Link href={`/mitarbeiter/${dokument.employee.id}`}>{dokument.employee.firstName} {dokument.employee.lastName}</Link>}
                        {dokument.event && <Link href={`/events/${dokument.event.id}`}>{dokument.event.name}</Link>}
                        {dokument.customer && <Link href={`/kunden/${dokument.customer.id}`}>{dokument.customer.name}</Link>}
                        {dokument.partner && <Link href={`/partner/${dokument.partner.id}`}>{dokument.partner.name}</Link>}
                      </td>
                      <td className="zahl">{dokument.expiresAt ? formatDateDE(dokument.expiresAt) : '–'}</td>
                      <td className="zahl" style={{ fontSize: 12 }}>{Math.max(1, Math.round(dokument.sizeBytes / 1024))} KB</td>
                      <td className="zahl" style={{ fontSize: 12, color: 'var(--text-2)' }}>{formatDateDE(dokument.createdAt)}</td>
                      <td>
                        {darfBearbeiten && (
                          <AktionsFormular aktion={dokumentEntfernenAktion} meldungOben={false}>
                            <input type="hidden" name="id" value={dokument.id} />
                            <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr" laufend="…">Entfernen</AktionsKnopf>
                          </AktionsFormular>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern seite={page} proSeite={perPage} gesamt={gesamt} />
      </Karte>
    </>
  );
}
