import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { formatDateDE } from '@/lib/time';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';

export const metadata: Metadata = { title: 'Audit-Log' };
export const dynamic = 'force-dynamic';

function zeitpunkt(datum: Date): string {
  return `${formatDateDE(datum)} ${datum.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Audit-Log (SecPlan 14 und 21).
 *
 * Drei Protokolle an einem Ort, weil sie dieselbe Frage beantworten:
 * wer hat was wann getan.
 *   – Fachliche Änderungen (Anlegen, Ändern, Löschen, Freigeben)
 *   – Zugriffe auf Dokumente, einschließlich verweigerter
 *   – Exporte, mit Umfang und Filter
 *
 * Keines davon lässt sich aus der Oberfläche ändern oder löschen. Es gibt
 * dafür keine Schaltfläche und keine Server-Aktion – das ist der Punkt.
 */
export default async function AuditLog({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await seite('audit.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params, 50);

  const where: Prisma.AuditLogWhereInput = {};
  if (params.q) {
    where.OR = [
      { summary: { contains: params.q, mode: 'insensitive' } },
      { actorLabel: { contains: params.q, mode: 'insensitive' } },
      { action: { contains: params.q, mode: 'insensitive' } },
      { entityId: params.q },
    ];
  }
  if (params.bereich) where.entity = params.bereich;

  const vor30Tagen = new Date(Date.now() - 30 * 86400000);

  const [eintraege, gesamt, bereiche, zugriffe, verweigert, exporte, aeltester] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: perPage }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ['entity'], _count: true, orderBy: { entity: 'asc' } }),
    db.documentAccessLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true, action: true, result: true, reason: true, createdAt: true, userId: true, role: true, ip: true,
        document: { select: { title: true, employee: { select: { id: true, lastName: true, firstName: true } } } },
      },
    }),
    db.documentAccessLog.count({ where: { result: 'VERWEIGERT', createdAt: { gte: vor30Tagen } } }),
    db.exportLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
    db.auditLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);

  const benutzerIds = [...new Set([
    ...zugriffe.map((z) => z.userId),
    ...exporte.map((e) => e.userId),
  ].filter((x): x is string => Boolean(x)))];
  const benutzer = benutzerIds.length > 0
    ? await db.user.findMany({ where: { id: { in: benutzerIds } }, select: { id: true, name: true } })
    : [];
  const nameVon = new Map(benutzer.map((u) => [u.id, u.name]));

  return (
    <>
      <Seitenkopf
        titel="Audit-Log"
        unter={`${gesamt.toLocaleString('de-DE')} Einträge${aeltester ? ` seit ${formatDateDE(aeltester.createdAt)}` : ''}`}
        brotkrumen={[{ href: '/compliance', label: 'HST Compliance' }]}
      />

      <Raster min={160}>
        <Kennzahl wert={gesamt} label="Protokollierte Vorgänge" />
        <Kennzahl wert={zugriffe.length} label="Dokumentzugriffe (zuletzt)" />
        <Kennzahl wert={verweigert} label="Verweigerte Zugriffe (30 T)"
                  farbe={verweigert > 0 ? 'gelb' : 'gruen'} />
        <Kennzahl wert={exporte.length} label="Exporte (zuletzt)" />
      </Raster>

      <div style={{ margin: '12px 0' }}>
        <Hinweis art="info">
          <strong>Das Protokoll lässt sich nicht bearbeiten.</strong> Es gibt in der Oberfläche
          keine Schaltfläche zum Ändern oder Löschen eines Eintrags und keine Server-Aktion, die
          das täte. Protokolliert werden: Anmeldungen, Rechteänderungen, Zugriffe auf Dokumente,
          Änderungen an Personal- und Einsatzdaten, Freigaben, Exporte und Löschungen.
        </Hinweis>
      </div>

      <h2 className="abschnitt">Fachliche Änderungen</h2>
      <Karte>
        <Filterleiste
          platzhalter="Benutzer, Aktion oder Beschreibung …"
          felder={[{ name: 'bereich', label: 'Objekt', optionen: bereiche.map((b) => ({ wert: b.entity, label: `${b.entity} (${b._count})` })) }]}
        />
        {eintraege.length === 0 ? <Leer>Keine Einträge in dieser Auswahl.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Aktion</th><th>Objekt</th><th>Beschreibung</th><th>IP</th></tr></thead>
              <tbody>
                {eintraege.map((eintrag) => (
                  <tr key={eintrag.id}>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{zeitpunkt(eintrag.createdAt)}</td>
                    <td style={{ fontSize: 12 }}>{eintrag.actorLabel}</td>
                    <td style={{ fontSize: 11 }}><span className="marke marke-grau">{eintrag.action}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{eintrag.entity}</td>
                    <td style={{ fontSize: 12 }}>{eintrag.summary}</td>
                    <td className="zahl" style={{ fontSize: 11, color: 'var(--text-3)' }}>{eintrag.ip ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern seite={page} proSeite={perPage} gesamt={gesamt} />
      </Karte>

      <h2 className="abschnitt">Zugriffe auf Dokumente</h2>
      <Karte>
        {zugriffe.length === 0 ? <Leer>Bisher wurde kein Dokument abgerufen.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Rolle</th><th>Dokument</th><th>Person</th><th>Vorgang</th><th>Ergebnis</th><th>IP</th></tr></thead>
              <tbody>
                {zugriffe.map((z) => (
                  <tr key={z.id} className={z.result === 'VERWEIGERT' ? 'zeile-rot' : undefined}>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{zeitpunkt(z.createdAt)}</td>
                    <td style={{ fontSize: 12 }}>{z.userId ? nameVon.get(z.userId) ?? 'gelöschtes Konto' : 'ohne Anmeldung'}</td>
                    <td style={{ fontSize: 11 }}>{z.role ?? '–'}</td>
                    <td style={{ fontSize: 12 }}>{z.document.title}</td>
                    <td style={{ fontSize: 12 }}>
                      {z.document.employee
                        ? <Link href={`/mitarbeiter/${z.document.employee.id}/datenschutz`}>
                            {z.document.employee.lastName}, {z.document.employee.firstName}
                          </Link>
                        : '–'}
                    </td>
                    <td style={{ fontSize: 12 }}>{z.action.toLowerCase()}</td>
                    <td>
                      {z.result === 'GEWAEHRT'
                        ? <span className="marke marke-gruen">gewährt</span>
                        : <span className="marke marke-rot" title={z.reason ?? undefined}>verweigert</span>}
                    </td>
                    <td className="zahl" style={{ fontSize: 11, color: 'var(--text-3)' }}>{z.ip ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <h2 className="abschnitt">Exporte</h2>
      <Karte>
        {exporte.length === 0 ? <Leer>Es wurde noch nichts exportiert.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Rolle</th><th>Bereich</th><th>Format</th><th>Datensätze</th><th>Filter</th><th>Zweck</th><th>IP</th></tr></thead>
              <tbody>
                {exporte.map((e) => (
                  <tr key={e.id} className={e.rowCount > 500 ? 'zeile-gelb' : undefined}>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{zeitpunkt(e.createdAt)}</td>
                    <td style={{ fontSize: 12 }}>{e.userId ? nameVon.get(e.userId) ?? 'gelöschtes Konto' : '–'}</td>
                    <td style={{ fontSize: 11 }}>{e.role ?? '–'}</td>
                    <td style={{ fontSize: 12 }}>{e.bereich}</td>
                    <td style={{ fontSize: 11 }}><span className="marke marke-grau">{e.format}</span></td>
                    <td className="zahl">{e.rowCount.toLocaleString('de-DE')}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 240 }}>{e.filter ?? '–'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{e.purpose ?? '–'}</td>
                    <td className="zahl" style={{ fontSize: 11, color: 'var(--text-3)' }}>{e.ip ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </>
  );
}
