import { ok, route } from '@/lib/api';
import { requireApiKey } from '@/lib/auth/apikey';
import { db } from '@/lib/db';
import { pruneSessions } from '@/lib/auth/session';
import { papierkorbLeeren } from '@/lib/domain/documents';

/**
 * Minimalvariante der taeglichen Aufgaben fuer externe Scheduler.
 * Der vollstaendige Lauf steckt in `scripts/daily-jobs.ts` (npm run jobs:daily).
 */
export const POST = route(async (request: Request) => {
  await requireApiKey(request, 'jobs');
  const [sitzungen, dateien, offeneAnfragen] = await Promise.all([
    pruneSessions(),
    papierkorbLeeren(30),
    db.request.count({ where: { deletedAt: null, status: 'NEU' } }),
  ]);
  return ok({ ausgefuehrt: true, entfernteSitzungen: sitzungen, entfernteDateien: dateien, offeneAnfragen });
});
