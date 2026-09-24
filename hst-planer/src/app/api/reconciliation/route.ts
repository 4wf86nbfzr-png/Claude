import { ok, pagination, route } from '@/lib/api';
import { apiZugang } from '@/lib/api-auth';
import { db } from '@/lib/db';

export const GET = route(async (request: Request) => {
  await apiZugang(request, 'reconciliation.view', 'reconciliation');
  const { page, perPage, skip } = pagination(new URL(request.url).searchParams, 25);

  const [abgleiche, gesamt] = await Promise.all([
    db.reconciliation.findMany({ orderBy: { createdAt: 'desc' }, skip, take: perPage }),
    db.reconciliation.count(),
  ]);

  return ok({
    daten: abgleiche.map((a) => ({
      id: a.id, referenz: a.reference, name: a.name, status: a.status, datei: a.fileName,
      zeitraum: { von: a.periodFrom?.toISOString().slice(0, 10) ?? null, bis: a.periodTo?.toISOString().slice(0, 10) ?? null },
      zahlen: {
        datensaetze: a.totalRows, zugeordnet: a.matchedRows, abweichungen: a.deviationRows,
        unbekannt: a.unknownRows, doppelt: a.duplicateRows, ohneIstZeit: a.missingRows,
      },
      abgeschlossen: a.closedAt?.toISOString() ?? null,
    })),
    seite: page, proSeite: perPage, gesamt,
  });
});
