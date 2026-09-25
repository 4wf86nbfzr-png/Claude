import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '../db';
import { AuthError, ForbiddenError } from '../errors';

/**
 * API-Schlüssel für Fremdsysteme (Spec 41).
 * Format: hst_<prefix>_<geheimnis>. In der Datenbank liegt nur der Hash;
 * der Klartext wird genau einmal beim Anlegen angezeigt.
 *
 * Präfix und Geheimnis stehen bewusst in Hexadezimal: base64url enthält
 * Unterstriche, und die würden den Schlüssel beim Zerlegen zerreissen.
 */
const PREFIX_LENGTH = 8;

export interface GeneratedKey { plain: string; prefix: string; keyHash: string }

export function generateApiKey(): GeneratedKey {
  const prefix = randomBytes(PREFIX_LENGTH / 2).toString('hex');
  const secret = randomBytes(32).toString('hex');
  const plain = `hst_${prefix}_${secret}`;
  return { plain, prefix, keyHash: createHash('sha256').update(plain).digest('hex') };
}

export interface ApiCaller { id: string; name: string; scopes: string[] }

/** Prüft den Header `Authorization: Bearer hst_...` oder `X-API-Key`. */
export async function requireApiKey(request: Request, scope?: string): Promise<ApiCaller> {
  const header = request.headers.get('authorization');
  const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  const plain = bearer ?? request.headers.get('x-api-key');
  if (!plain) throw new AuthError('Es wurde kein API-Schlüssel übermittelt.');

  const parts = plain.trim().split('_');
  if (parts.length !== 3 || parts[0] !== 'hst' || !/^[0-9a-f]+$/.test(parts[1] ?? '')) {
    throw new AuthError('Der API-Schlüssel ist ungültig.');
  }

  const key = await db.apiKey.findUnique({ where: { prefix: parts[1]! } });
  if (!key || !key.active) throw new AuthError('Der API-Schlüssel ist ungültig.');
  if (key.expiresAt && key.expiresAt < new Date()) throw new AuthError('Der API-Schlüssel ist abgelaufen.');

  const given = Buffer.from(createHash('sha256').update(plain).digest('hex'), 'utf8');
  const stored = Buffer.from(key.keyHash, 'utf8');
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    throw new AuthError('Der API-Schlüssel ist ungültig.');
  }

  if (scope && key.scopes.length && !key.scopes.includes(scope) && !key.scopes.includes('*')) {
    throw new ForbiddenError('Dieser API-Schlüssel darf diese Funktion nicht nutzen.');
  }

  // Letzte Nutzung nachtragen, ohne die Antwort zu verzögern.
  void db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { id: key.id, name: key.name, scopes: key.scopes };
}
