import { ok, route } from '@/lib/api';
import { requireApiKey } from '@/lib/auth/apikey';
import { postfachAbrufen, postfachKonfiguriert } from '@/lib/email/mailbox';

/**
 * Postfachabruf fuer externe Scheduler.
 *   curl -X POST -H "x-api-key: hst_..." https://planer.example/api/jobs/postfach
 */
export const POST = route(async (request: Request) => {
  await requireApiKey(request, 'jobs');
  if (!postfachKonfiguriert()) {
    return ok({ ausgefuehrt: false, hinweis: 'Es ist kein Postfach konfiguriert.' }, { status: 503 });
  }
  const ergebnis = await postfachAbrufen();
  return ok({ ausgefuehrt: true, ...ergebnis });
});
