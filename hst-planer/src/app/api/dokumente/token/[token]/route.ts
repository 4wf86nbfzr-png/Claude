import { NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { headers } from 'next/headers';
import { route } from '@/lib/api';
import { clientIp } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { resolveStored } from '@/lib/storage';
import { protokolliereZugriff, tokenEinloesen } from '@/lib/domain/dokumentzugriff';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Abruf über einen kurzlebigen Token (SecPlan 6).
 *
 * Der Token gilt für genau ein Dokument, genau eine Person, eine Stunde
 * und genau einen Abruf. Er ist kein öffentlicher Downloadlink: wer ihn
 * weitergibt, verbraucht ihn – und der Abruf steht mit Zeitpunkt im
 * Protokoll.
 *
 * Bewusst mit Ratenbremse: eine 64-stellige Hexzeichenkette ist nicht zu
 * raten, aber Versuche gehören trotzdem gedeckelt.
 */
export const GET = route(async (_request: Request, context: { params: Promise<{ token: string }> }) => {
  const ip = await clientIp();
  if (!rateLimit(`dokument-token:${ip ?? 'unbekannt'}`, 30, 60).ok) {
    throw new NotFoundError('Zu viele Versuche. Bitte in einer Minute erneut.');
  }

  const { token } = await context.params;
  const einloesung = await tokenEinloesen(token);
  if (!einloesung) {
    // Absichtlich dieselbe Antwort für „gibt es nicht", „abgelaufen" und
    // „schon benutzt": aus der Antwort soll nichts ableitbar sein.
    throw new NotFoundError('Dieser Zugriffslink gilt nicht mehr.');
  }

  const [dokument, benutzer] = await Promise.all([
    db.document.findFirst({ where: { id: einloesung.dokumentId, deletedAt: null } }),
    db.user.findFirst({ where: { id: einloesung.userId, deletedAt: null, active: true }, select: { id: true, role: true } }),
  ]);
  if (!dokument) throw new NotFoundError('Das Dokument wurde inzwischen entfernt.');
  if (!benutzer) throw new NotFoundError('Dieser Zugriffslink gilt nicht mehr.');

  const kopf = await headers();
  await protokolliereZugriff(
    dokument.id,
    { id: benutzer.id, role: benutzer.role } as never,
    'TOKEN_EINGELOEST',
    { erlaubt: true },
    { ip, userAgent: kopf.get('user-agent') },
  );

  const stream = createReadStream(resolveStored(dokument.filePath));
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'content-type': dokument.mimeType,
      'content-length': String(dokument.sizeBytes),
      'content-disposition': `attachment; filename="${encodeURIComponent(dokument.fileName)}"`,
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
});
