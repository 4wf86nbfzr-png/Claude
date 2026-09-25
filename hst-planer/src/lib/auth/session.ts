import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '../db';
import { AuthError, ForbiddenError } from '../errors';
import { can, scopeOf, type Permission, type Role, type Scope } from './rbac';

export const SESSION_COOKIE = 'hst_session';
const SESSION_DAYS = 14;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error('AUTH_SECRET fehlt oder ist zu kurz. Bitte in der .env setzen (mindestens 32 Zeichen).');
  }
  return new TextEncoder().encode(value);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
  partnerId: string | null;
  customerId: string | null;
  theme: string;
  scope: Scope;
  sessionId: string;
}

/**
 * Legt eine Sitzung an. Das Cookie trägt ein signiertes JWT, die Sitzung
 * selbst steht zusätzlich in der Datenbank – nur so lassen sich einzelne
 * Sitzungen gezielt beenden (Spec 48).
 */
export async function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);

  const session = await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: meta.ip?.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 255),
    },
  });

  const jwt = await new SignJWT({ sid: session.id, tok: token })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());

  const store = await cookies();
  store.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: (process.env.APP_URL ?? '').startsWith('https://'),
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    try {
      const { payload } = await jwtVerify(raw, secret());
      const sid = payload.sid as string | undefined;
      if (sid) await db.session.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date() } });
    } catch {
      // abgelaufenes oder manipuliertes Cookie – einfach löschen
    }
  }
  store.delete(SESSION_COOKIE);
}

/** Liefert den angemeldeten Benutzer oder null. Wirft nie. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  let sid: string | undefined;
  let tok: string | undefined;
  try {
    const { payload } = await jwtVerify(raw, secret());
    sid = payload.sid as string | undefined;
    tok = payload.tok as string | undefined;
  } catch {
    return null;
  }
  if (!sid || !tok) return null;

  const session = await db.session.findUnique({
    where: { id: sid },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.tokenHash !== hashToken(tok)) return null;

  const user = session.user;
  if (!user.active || user.deletedAt) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    employeeId: user.employeeId,
    partnerId: user.partnerId,
    customerId: user.customerId,
    theme: user.theme,
    scope: scopeOf(user.role as Role),
    sessionId: session.id,
  };
}

/** Erzwingt eine Anmeldung. Für Seiten und API-Routen gleichermassen. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError();
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) throw new ForbiddenError();
  return user;
}

export async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? undefined;
}

export async function userAgent(): Promise<string | undefined> {
  return (await headers()).get('user-agent') ?? undefined;
}

/** Abgelaufene Sitzungen aufräumen (taeglicher Job). */
export async function pruneSessions(): Promise<number> {
  const result = await db.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 30 * 86400000) } }] },
  });
  return result.count;
}
