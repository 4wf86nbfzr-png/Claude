import { NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { route } from '@/lib/api';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { resolveStored } from '@/lib/storage';
import { darfSehen } from '@/lib/domain/documents';
import { audit } from '@/lib/audit';

/**
 * Dokumente werden nie direkt aus dem Dateisystem ausgeliefert, sondern
 * ausschließlich über diese Route – nach Rechtepruefung und mit Protokoll
 * (Spec 30/48).
 */
export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;

  const dokument = await db.document.findFirst({ where: { id, deletedAt: null } });
  if (!dokument) throw new NotFoundError('Das Dokument wurde nicht gefunden.');
  if (!(await darfSehen(user, id))) throw new ForbiddenError('Sie dürfen dieses Dokument nicht ansehen.');

  await audit(user, {
    action: 'document.download', entity: 'Document', entityId: id,
    summary: `Dokument "${dokument.title}" abgerufen`,
  });

  const stream = createReadStream(resolveStored(dokument.filePath));
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'content-type': dokument.mimeType,
      'content-length': String(dokument.sizeBytes),
      // inline wäre bequemer, ist aber bei fremden Dateien riskanter.
      'content-disposition': `attachment; filename="${encodeURIComponent(dokument.fileName)}"`,
      'cache-control': 'private, no-store',
    },
  });
});
