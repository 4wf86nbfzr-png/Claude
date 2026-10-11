import { apiHandler, parseBody, parseQuery, ok } from "@/server/api/handler";
import { listRequests, createRequest, publicRequest } from "@/server/modules/requests/service";
import { requestInput, requestListQuery } from "@/server/modules/requests/schema";

export const dynamic = "force-dynamic";

export const GET = apiHandler({ permissions: ["requests:read"] }, async ({ req, ctx }) => {
  const page = await listRequests(ctx, parseQuery(req, requestListQuery));
  return ok({ ...page, items: page.items.map((r) => ({ ...publicRequest(r), customerName: r.customerName })) });
});

/**
 * POST /api/v1/customer-requests – unverbindliche Anfrage anlegen (z. B. aus Webformular).
 * Duplikate: gleicher externalRef → bestehende Anfrage (200); gleicher Fingerabdruck → Status "duplicate" (201, duplicate=true).
 */
export const POST = apiHandler({ permissions: ["requests:write"], idempotent: true }, async ({ req, ctx }) => {
  const body = await parseBody(req, requestInput);
  const r = await createRequest(ctx, { ...body, source: ctx.kind === "api_key" ? "api" : body.source });
  return ok({ ...publicRequest(r.request), duplicate: r.duplicate }, { status: r.existing ? 200 : 201 });
});
