import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { Karte, Leer, Seitenkopf } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';

export const metadata: Metadata = { title: 'Protokoll' };
export const dynamic = 'force-dynamic';

/** Audit Log (Spec 32). Nur lesbar – Einträge werden nie geändert oder gelöscht. */
export default async function Protokoll({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
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

  const [eintraege, gesamt, bereiche] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: perPage }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ['entity'], _count: true, orderBy: { entity: 'asc' } }),
  ]);

  return (
    <>
      <Seitenkopf titel="Protokoll" brotkrumen={[{ href: '/admin', label: 'Admin' }]}
                  unter={`${gesamt.toLocaleString('de-DE')} Einträge · revisionssicher, nicht änderbar`} />

      <Karte>
        <Filterleiste
          platzhalter="Benutzer, Aktion oder Beschreibung …"
          felder={[{ name: 'bereich', label: 'Objekt', optionen: bereiche.map((b) => ({ wert: b.entity, label: `${b.entity} (${b._count})` })) }]}
        />
        {eintraege.length === 0 ? <Leer>Keine Einträge in dieser Auswahl.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Aktion</th><th>Objekt</th><th>Beschreibung</th><th>Änderung</th></tr></thead>
              <tbody>
                {eintraege.map((eintrag) => (
                  <tr key={eintrag.id}>
                    <td className="zahl" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                      {eintrag.createdAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}
                    </td>
                    <td style={{ fontSize: 12 }}>{eintrag.actorLabel}</td>
                    <td className="zahl" style={{ fontSize: 11, color: 'var(--text-2)' }}>{eintrag.action}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{eintrag.entity}</td>
                    <td style={{ fontSize: 13 }}>{eintrag.summary}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-3)', maxWidth: 260 }}>
                      {eintrag.before || eintrag.after ? (
                        <details>
                          <summary style={{ cursor: 'pointer' }}>vorher / nachher</summary>
                          <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10 }}>
                            {JSON.stringify({ vorher: eintrag.before, nachher: eintrag.after }, null, 1)}
                          </pre>
                        </details>
                      ) : '–'}
                    </td>
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
