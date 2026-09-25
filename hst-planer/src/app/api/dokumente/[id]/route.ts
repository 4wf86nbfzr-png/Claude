import { NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { headers } from 'next/headers';
import { route } from '@/lib/api';
import { clientIp, requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { resolveStored } from '@/lib/storage';
import { pruefeDokumentZugriff, protokolliereZugriff } from '@/lib/domain/dokumentzugriff';

/**
 * Dokumente werden nie direkt aus dem Dateisystem ausgeliefert, sondern
 * ausschließlich über diese Route (SecPlan 6).
 *
 * Geprüft werden Anmeldung, Recht, Zugriffsebene und der Bezug zur
 * eigenen Zuständigkeit. Protokolliert wird jeder Versuch – auch der
 * abgewiesene, denn der ist der interessantere.
 */
export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const kopf = await headers();
  const spur = { ip: await clientIp(), userAgent: kopf.get('user-agent') };

  const dokument = await db.document.findFirst({ where: { id, deletedAt: null } });
  if (!dokument) throw new NotFoundError('Das Dokument wurde nicht gefunden.');

  const urteil = await pruefeDokumentZugriff(user, id);
  await protokolliereZugriff(id, user, 'HERUNTERLADEN', urteil, spur);
  if (!urteil.erlaubt) throw new ForbiddenError(urteil.grund ?? 'Sie dürfen dieses Dokument nicht ansehen.');

  const stream = createReadStream(resolveStored(dokument.filePath));
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'content-type': dokument.mimeType,
      'content-length': String(dokument.sizeBytes),
      // inline wäre bequemer, ist aber bei fremden Dateien riskanter.
      'content-disposition': `attachment; filename="${encodeURIComponent(dokument.fileName)}"`,
      'cache-control': 'private, no-store',
      // Auch wenn die Datei nur über diese Route kommt: kein Zwischenspeicher
      // beim Weiterleiten, und keine Adresse im Verweis auf die Vorseite.
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
});
