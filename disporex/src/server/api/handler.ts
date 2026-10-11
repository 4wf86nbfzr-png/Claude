import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../core/errors";
import { logger } from "../core/logger";
import { captureError } from "../core/monitoring";
import { newRequestId } from "../core/ids";
import { checkRateLimit } from "../core/rate-limit";
import { env } from "../core/env";
import { SESSION_COOKIE, findSession, buildContextFromSession } from "../auth/session";
import { authenticateApiKey } from "../auth/api-keys";
import type { AuthContext } from "../auth/context";
import type { Permission } from "../auth/permissions";
import { clientIp } from "../auth/current";
import { withTenant } from "../db/client";
import { idempotencyKeys } from "../db/schema";
import { and, eq, gt } from "drizzle-orm";
import { sha256 } from "../core/crypto";

export type ApiError = { error: { code: string; message: string; details?: unknown }; requestId: string };

export type HandlerArgs<P> = {
  req: NextRequest;
  ctx: AuthContext;
  params: P;
  requestId: string;
};

type Options = {
  /** Erforderliche Berechtigungen (alle). */
  permissions?: Permission[];
  /** Öffentlicher Endpunkt (z. B. Health). */
  public?: boolean;
  /** Idempotenz über Header `Idempotency-Key` unterstützen (nur für POST). */
  idempotent?: boolean;
  rateLimitPerMinute?: number;
};

export function errorResponse(status: number, code: string, message: string, requestId: string, details?: unknown): NextResponse<ApiError> {
  const body: ApiError = { error: { code, message, ...(details !== undefined ? { details } : {}) }, requestId };
  const res = NextResponse.json(body, { status });
  res.headers.set("x-request-id", requestId);
  return res;
}

export function mapError(err: unknown, requestId: string): NextResponse<ApiError> {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return errorResponse(400, "validation_error", "Eingabe ungültig", requestId, details);
  }
  if (err instanceof AppError) {
    const res = errorResponse(err.status, err.code, err.message, requestId, err.details);
    return res;
  }
  logger.error({ err, requestId }, "Unbehandelter Fehler");
  void captureError(err, { requestId, kind: "api" });
  return errorResponse(500, "internal_error", "Interner Fehler. Bitte Request-ID bei Rückfragen angeben.", requestId);
}

/** Authentifiziert über Bearer-API-Key oder Sitzungscookie. */
export async function authenticateRequest(req: NextRequest, requestId: string): Promise<AuthContext | null> {
  const ip = clientIp(req.headers);
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return authenticateApiKey(auth.slice(7).trim(), { requestId, ip });
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const info = await findSession(token);
  if (!info) return null;
  return buildContextFromSession(info, { requestId, ip });
}

/**
 * Wrapper für Route-Handler: Request-ID, Authentifizierung, Rate-Limit,
 * Berechtigungen, Idempotenz und einheitliche Fehlerantworten.
 */
export function apiHandler<P = Record<string, string>>(opts: Options, fn: (args: HandlerArgs<P>) => Promise<NextResponse | Response>) {
  return async (req: NextRequest, routeCtx?: { params: Promise<P> }): Promise<Response> => {
    const requestId = req.headers.get("x-request-id")?.slice(0, 80) ?? newRequestId();
    try {
      const ip = clientIp(req.headers) ?? "unknown";
      const rl = checkRateLimit(`api:${ip}`, opts.rateLimitPerMinute ?? env().RATE_LIMIT_API_PER_MINUTE);
      if (!rl.allowed) {
        const res = errorResponse(429, "rate_limited", "Zu viele Anfragen", requestId);
        res.headers.set("retry-after", String(rl.retryAfterSec));
        return res;
      }
      let ctx: AuthContext;
      if (opts.public) {
        ctx = { kind: "system", tenantId: "", userId: null, userName: "anonym", role: "system", permissions: new Set(), isSystemAdmin: false, employeeId: null, customerId: null, partnerId: null, requestId, ip };
      } else {
        const found = await authenticateRequest(req, requestId);
        if (!found) return errorResponse(401, "unauthorized", "Anmeldung oder gültiger API-Schlüssel erforderlich", requestId);
        ctx = found;
        if (!ctx.tenantId) return errorResponse(403, "forbidden", "Kein Mandant ausgewählt", requestId);
        for (const p of opts.permissions ?? []) {
          if (!ctx.permissions.has(p)) return errorResponse(403, "forbidden", `Berechtigung fehlt: ${p}`, requestId);
        }
        const keyRl = checkRateLimit(`api:key:${ctx.apiKeyId ?? ctx.userId}`, opts.rateLimitPerMinute ?? env().RATE_LIMIT_API_PER_MINUTE);
        if (!keyRl.allowed) return errorResponse(429, "rate_limited", "Zu viele Anfragen", requestId);
      }
      const params = routeCtx ? await routeCtx.params : ({} as P);

      // Idempotenz: gleicher Schlüssel + gleicher Body => gespeicherte Antwort
      const idemKey = opts.idempotent && req.method === "POST" ? req.headers.get("idempotency-key") : null;
      let bodyHash: string | null = null;
      if (idemKey) {
        if (idemKey.length > 200) return errorResponse(400, "validation_error", "Idempotency-Key zu lang", requestId);
        const bodyText = await req.clone().text();
        bodyHash = sha256(`${req.method} ${req.nextUrl.pathname} ${bodyText}`);
        const existing = await withTenant(ctx.tenantId, (tx) =>
          tx
            .select()
            .from(idempotencyKeys)
            .where(and(eq(idempotencyKeys.tenantId, ctx.tenantId), eq(idempotencyKeys.key, idemKey), gt(idempotencyKeys.expiresAt, new Date())))
            .limit(1),
        );
        const hit = existing[0];
        if (hit) {
          if (hit.requestHash !== bodyHash) return errorResponse(422, "idempotency_mismatch", "Idempotency-Key wurde bereits mit anderem Inhalt verwendet", requestId);
          if (hit.responseStatus && hit.responseBody !== null) {
            const res = NextResponse.json(hit.responseBody, { status: hit.responseStatus });
            res.headers.set("x-request-id", requestId);
            res.headers.set("idempotent-replayed", "true");
            return res;
          }
        }
      }

      const res = await fn({ req, ctx, params, requestId });
      res.headers.set("x-request-id", requestId);

      if (idemKey && bodyHash && res.status < 500) {
        const cloned = res.clone();
        const json = await cloned.json().catch(() => null);
        await withTenant(ctx.tenantId, (tx) =>
          tx
            .insert(idempotencyKeys)
            .values({ tenantId: ctx.tenantId, key: idemKey, requestHash: bodyHash!, responseStatus: res.status, responseBody: json, expiresAt: new Date(Date.now() + 24 * 3_600_000) })
            .onConflictDoNothing(),
        );
      }
      return res;
    } catch (err) {
      return mapError(err, requestId);
    }
  };
}

/** Body als JSON lesen und validieren. */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("Request-Body muss gültiges JSON sein", 400, "invalid_json");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string | string[]> = {};
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    const prev = obj[k];
    if (prev === undefined) obj[k] = v;
    else obj[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return schema.parse(obj);
}

export function ok<T>(data: T, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, { status: init?.status ?? 200 });
}
