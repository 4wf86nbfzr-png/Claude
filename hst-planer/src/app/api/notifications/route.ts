import { ok, parseBody, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { markRead } from '@/lib/notify';
import { z } from 'zod';

export const GET = route(async () => {
  const user = await requireUser();
  const [eintraege, ungelesen] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return ok({
    ungelesen,
    daten: eintraege.map((e) => ({
      id: e.id, art: e.kind, titel: e.title, text: e.body, link: e.link,
      gelesen: Boolean(e.readAt), zeitpunkt: e.createdAt.toISOString(),
    })),
  });
});

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const eingabe = await parseBody(request, z.object({ ids: z.array(z.string()).min(1) }));
  const anzahl = await markRead(user.id, eingabe.ids);
  return ok({ alsGelesenMarkiert: anzahl });
});
