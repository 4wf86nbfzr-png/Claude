import { apiHandler, parseBody, parseQuery, ok } from "@/server/api/handler";
import { listEvents, createEvent, publicEvent } from "@/server/modules/events/service";
import { eventInput, eventListQuery } from "@/server/modules/events/schema";

export const dynamic = "force-dynamic";

/** GET /api/v1/events – Liste mit Filtern (status, customerId, from, to, q), Pagination, Sortierung. */
export const GET = apiHandler({ permissions: ["events:read"] }, async ({ req, ctx }) => {
  const q = parseQuery(req, eventListQuery);
  const page = await listEvents(ctx, q);
  return ok({ ...page, items: page.items.map((e) => ({ ...publicEvent(e), customerName: e.customerName, locationName: e.locationName, staffing: { required: e.required, filled: e.filled, pending: e.pending } })) });
});

/** POST /api/v1/events – Veranstaltung anlegen (Status draft). Idempotent über Idempotency-Key. */
export const POST = apiHandler({ permissions: ["events:write"], idempotent: true }, async ({ req, ctx }) => {
  const body = await parseBody(req, eventInput);
  const e = await createEvent(ctx, body);
  return ok(publicEvent(e), { status: 201 });
});
