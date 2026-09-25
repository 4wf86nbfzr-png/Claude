import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'Partnerunternehmen' };
export const dynamic = 'force-dynamic';

/**
 * Partnerunternehmen (SecPlan 2, Bereich PARTNER).
 *
 * Die Stammdatensicht auf die Firmen: Anschrift, Ansprechpartner,
 * Konditionen, Zugänge. Wer Kräfte eines Partners plant, ist damit
 * Auftraggeber gegenüber einem Dritten – deshalb steht hier auch, ob
 * ein Auftragsverarbeitungsvertrag vorliegt.
 */
export default async function Partnerunternehmen() {
  const user = await seite('partners.view');
  const nurEigenes = user.scope === 'PARTNER';

  const partner = await db.partner.findMany({
    where: { deletedAt: null, ...(nurEigenes ? { id: user.partnerId ?? '__kein_partner__' } : {}) },
    select: {
      id: true, name: true, contactName: true, email: true, phone: true,
      street: true, zip: true, city: true, hourlyRate: true, active: true,
      _count: {
        select: {
          employees: { where: { deletedAt: null } },
          users: { where: { deletedAt: null } },
          assignments: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });

  // Auftragsverarbeiter mit demselben Namen – die Verbindung ist bewusst
  // über den Namen und nicht über einen Fremdschlüssel: nicht jeder
  // Partner ist Auftragsverarbeiter, und nicht jeder Auftragsverarbeiter
  // ist Partner.
  const verarbeiter = await db.processor.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, avvStatus: true },
  });
  const avvVon = new Map(verarbeiter.map((v) => [v.name.toLowerCase(), v]));

  const darfBearbeiten = can(user.role, 'partners.edit');
  const ohneAvv = partner.filter((p) => !avvVon.get(p.name.toLowerCase()));

  return (
    <>
      <Seitenkopf
        titel="Partnerunternehmen"
        unter={`${partner.length} Unternehmen`}
        aktionen={darfBearbeiten && <Link href="/partner/neu" className="knopf knopf-primaer">Neues Unternehmen</Link>}
      />

      <Raster min={160}>
        <Kennzahl wert={partner.filter((p) => p.active).length} label="Aktive Unternehmen" />
        <Kennzahl wert={partner.reduce((s, p) => s + p._count.employees, 0)} label="Gemeldete Kräfte" />
        <Kennzahl wert={partner.reduce((s, p) => s + p._count.users, 0)} label="Zugänge" />
        <Kennzahl wert={ohneAvv.length} label="Ohne AVV-Eintrag"
                  href="/compliance/avv"
                  farbe={ohneAvv.length > 0 ? 'gelb' : 'gruen'} />
      </Raster>

      {ohneAvv.length > 0 && !nurEigenes && (
        <div style={{ margin: '12px 0' }}>
          <Hinweis art="warnung">
            Für {ohneAvv.length} {ohneAvv.length === 1 ? 'Unternehmen' : 'Unternehmen'} gibt es
            keinen Eintrag in der AVV-Liste. Ob überhaupt eine Auftragsverarbeitung vorliegt, ist
            eine rechtliche Frage – das System kann sie nicht beantworten, aber es kann daran
            erinnern, sie zu stellen.
          </Hinweis>
        </div>
      )}

      <Karte>
        {partner.length === 0 ? (
          <Leer>Es ist kein Partnerunternehmen hinterlegt.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Unternehmen</th><th>Ansprechpartner</th><th>Kontakt</th><th>Anschrift</th>
                  <th>Kräfte</th><th>Zugänge</th><th>Einsätze</th><th>AVV</th>
                </tr>
              </thead>
              <tbody>
                {partner.map((p) => {
                  const avv = avvVon.get(p.name.toLowerCase());
                  return (
                    <tr key={p.id} className={p.active ? undefined : 'zeile-grau'}>
                      <td>
                        <Link href={`/partner/${p.id}`} style={{ fontWeight: 500 }}>{p.name}</Link>
                        {!p.active && <span className="marke marke-grau" style={{ marginLeft: 5 }}>inaktiv</span>}
                      </td>
                      <td style={{ color: 'var(--text-2)' }}>{p.contactName ?? '–'}</td>
                      <td style={{ fontSize: 12 }}>
                        {p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : p.phone ?? '–'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        {[p.street, [p.zip, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–'}
                      </td>
                      <td className="zahl"><Link href={`/partner/mitarbeiter?partner=${p.id}`}>{p._count.employees}</Link></td>
                      <td className="zahl">{p._count.users}</td>
                      <td className="zahl"><Link href={`/partner/einsaetze?partner=${p.id}`}>{p._count.assignments}</Link></td>
                      <td style={{ fontSize: 11 }}>
                        {avv
                          ? <Link href="/compliance/avv" className={`marke marke-${avv.avvStatus === 'UNTERZEICHNET' ? 'gruen' : 'gelb'}`}>
                              {avv.avvStatus === 'UNTERZEICHNET' ? 'unterzeichnet' : avv.avvStatus.toLowerCase()}
                            </Link>
                          : <span className="marke marke-gelb">kein Eintrag</span>}
                      </td>
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
