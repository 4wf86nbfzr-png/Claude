import { and, eq, isNull, or, gt } from "drizzle-orm";
import { withSystem, withTenant } from "../db/client";
import { apiKeys, rolePermissionOverrides, tenants } from "../db/schema";
import { randomToken, sha256 } from "../core/crypto";
import { ForbiddenError, NotFoundError, ValidationError } from "../core/errors";
import { isPermission, type Permission } from "./permissions";
import type { AuthContext } from "./context";
import { audit } from "../core/audit";
import { newRequestId } from "../core/ids";

const PREFIX = "drx_";

export type CreatedApiKey = { id: string; name: string; prefix: string; secret: string; scopes: string[]; expiresAt: Date | null };

/**
 * Erstellt einen API-Schlüssel. Der Klartext wird genau einmal zurückgegeben;
 * in der Datenbank liegt nur SHA-256. Scopes dürfen die Rechte des Erstellers
 * nicht übersteigen.
 */
export async function createApiKey(ctx: AuthContext, input: { name: string; scopes: string[]; expiresAt?: Date | null; rotatedFromId?: string | null }): Promise<CreatedApiKey> {
  if (!ctx.permissions.has("api_keys:manage")) throw new ForbiddenError();
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new ValidationError("Name: 2–80 Zeichen");
  const scopes = Array.from(new Set(input.scopes));
  for (const s of scopes) {
    if (!isPermission(s)) throw new ValidationError(`Unbekannter Scope: ${s}`);
    if (!ctx.permissions.has(s)) throw new ForbiddenError(`Scope ${s} übersteigt Ihre eigenen Rechte`);
  }
  const secret = `${PREFIX}${randomToken(32)}`;
  const prefix = secret.slice(0, 12);
  const [row] = await withTenant(ctx.tenantId, async (tx) => {
    const inserted = await tx
      .insert(apiKeys)
      .values({ tenantId: ctx.tenantId, name, prefix, keyHash: sha256(secret), scopes, createdBy: ctx.userId, expiresAt: input.expiresAt ?? null, rotatedFromId: input.rotatedFromId ?? null })
      .returning();
    await audit(tx, ctx, { action: "api_key.created", entityType: "api_key", entityId: inserted[0]!.id, after: { name, scopes, prefix } });
    return inserted;
  });
  return { id: row!.id, name, prefix, secret, scopes, expiresAt: row!.expiresAt };
}

export async function listApiKeys(ctx: AuthContext) {
  if (!ctx.permissions.has("api_keys:manage")) throw new ForbiddenError();
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        scopes: apiKeys.scopes,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        rotatedFromId: apiKeys.rotatedFromId,
      })
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, ctx.tenantId))
      .orderBy(apiKeys.createdAt),
  );
}

export async function revokeApiKey(ctx: AuthContext, id: string): Promise<void> {
  if (!ctx.permissions.has("api_keys:manage")) throw new ForbiddenError();
  await withTenant(ctx.tenantId, async (tx) => {
    const res = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, ctx.tenantId), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id });
    if (!res[0]) throw new NotFoundError("API-Schlüssel nicht gefunden");
    await audit(tx, ctx, { action: "api_key.revoked", entityType: "api_key", entityId: id });
  });
}

/** Rotation: neuer Schlüssel mit gleichen Scopes, alter läuft nach Übergangsfrist aus. */
export async function rotateApiKey(ctx: AuthContext, id: string, graceHours = 24): Promise<CreatedApiKey> {
  if (!ctx.permissions.has("api_keys:manage")) throw new ForbiddenError();
  const old = (await withTenant(ctx.tenantId, (tx) => tx.select().from(apiKeys).where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt))).limit(1)))[0];
  if (!old) throw new NotFoundError("API-Schlüssel nicht gefunden");
  const created = await createApiKey(ctx, { name: old.name, scopes: old.scopes, expiresAt: old.expiresAt, rotatedFromId: old.id });
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.update(apiKeys).set({ expiresAt: new Date(Date.now() + graceHours * 3_600_000) }).where(eq(apiKeys.id, old.id));
    await audit(tx, ctx, { action: "api_key.rotated", entityType: "api_key", entityId: old.id, after: { newKeyId: created.id, graceHours } });
  });
  return created;
}

/** Prüft einen Bearer-Schlüssel und erzeugt den AuthContext. */
export async function authenticateApiKey(secret: string, meta: { requestId?: string; ip?: string } = {}): Promise<AuthContext | null> {
  if (!secret.startsWith(PREFIX) || secret.length < 20) return null;
  const keyHash = sha256(secret);
  return withSystem(async (tx) => {
    const row = (
      await tx
        .select({ k: apiKeys, tenantStatus: tenants.status, tenantId: tenants.id })
        .from(apiKeys)
        .innerJoin(tenants, eq(tenants.id, apiKeys.tenantId))
        .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt), or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date()))))
        .limit(1)
    )[0];
    if (!row || row.tenantStatus !== "active") return null;
    if (!row.k.lastUsedAt || Date.now() - row.k.lastUsedAt.getTime() > 60_000) {
      await tx.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.k.id));
    }
    void rolePermissionOverrides;
    const permissions = new Set<Permission>(row.k.scopes.filter(isPermission));
    return {
      kind: "api_key",
      tenantId: row.tenantId,
      userId: null,
      userName: `API-Schlüssel ${row.k.name}`,
      role: "system",
      permissions,
      isSystemAdmin: false,
      employeeId: null,
      customerId: null,
      partnerId: null,
      apiKeyId: row.k.id,
      requestId: meta.requestId ?? newRequestId(),
      ip: meta.ip,
    };
  });
}
