import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { closeDb } from "../../src/server/db/client";
import { makeTenant } from "../helpers";
import { createApiKey } from "../../src/server/auth/api-keys";
import { createCustomer } from "../../src/server/modules/customers/service";
import { createEmployee } from "../../src/server/modules/employees/service";
import { resetRateLimits } from "../../src/server/core/rate-limit";
import * as requestsRoute from "../../src/app/api/v1/customer-requests/route";
import * as requestRoute from "../../src/app/api/v1/customer-requests/[id]/route";
import * as eventsRoute from "../../src/app/api/v1/events/route";
import * as eventRoute from "../../src/app/api/v1/events/[id]/route";
import * as positionsRoute from "../../src/app/api/v1/events/[id]/positions/route";
import * as shiftsRoute from "../../src/app/api/v1/shifts/route";
import * as assignRoute from "../../src/app/api/v1/shifts/[id]/assign/route";
import * as importRoute from "../../src/app/api/v1/time-records/import/route";
import * as reconRoute from "../../src/app/api/v1/reconciliation-items/route";
import * as healthRoute from "../../src/app/api/health/route";
import * as openapiRoute from "../../src/app/api/v1/openapi.json/route";

afterAll(() => closeDb());

const BASE = "http://localhost:3000/api/v1";

function req(method: string, path: string, opts: { key?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.key) headers.authorization = `Bearer ${opts.key}`;
  let body: string | undefined;
  if (opts.raw !== undefined) {
    body = opts.raw;
    headers["content-type"] = headers["content-type"] ?? "application/json";
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  return new NextRequest(`${BASE}${path}`, { method, headers, body });
}
const params = <P extends Record<string, string>>(p: P) => ({ params: Promise.resolve(p) });
async function json(res: Response) {
  return { status: res.status, body: await res.json(), requestId: res.headers.get("x-request-id") };
}

describe("API v1", () => {
  it("Health ist öffentlich; OpenAPI wird ausgeliefert", async () => {
    const h = await json(await healthRoute.GET());
    expect(h.status).toBe(200);
    expect(h.body.db).toBe("ok");
    const o = await json(await openapiRoute.GET());
    expect(o.body.openapi).toBe("3.1.0");
    expect(Object.keys(o.body.paths).length).toBeGreaterThan(25);
  });

  it("Szenario 12: ohne Schlüssel 401, mit fehlendem Scope 403, ungültiger Schlüssel 401", async () => {
    resetRateLimits();
    const f = await makeTenant();
    const r401 = await json(await eventsRoute.GET(req("GET", "/events")));
    expect(r401.status).toBe(401);
    expect(r401.body.error.code).toBe("unauthorized");
    expect(r401.requestId).toBeTruthy();
    const limited = await createApiKey(f.ctx, { name: "nur lesen", scopes: ["events:read"] });
    const r403 = await json(await eventsRoute.POST(req("POST", "/events", { key: limited.secret, body: {} })));
    expect(r403.status).toBe(403);
    expect(r403.body.error.message).toContain("events:write");
    const bad = await json(await eventsRoute.GET(req("GET", "/events", { key: "drx_falscherschluessel_000000000000000000000" })));
    expect(bad.status).toBe(401);
    const ok = await json(await eventsRoute.GET(req("GET", "/events", { key: limited.secret })));
    expect(ok.status).toBe(200);
    expect(ok.body.items).toEqual([]);
  });

  it("Szenario 6+7: Anfrage per API anlegen, Validierung, Duplikat, externalRef, Idempotenz", async () => {
    resetRateLimits();
    const f = await makeTenant();
    const key = await createApiKey(f.ctx, { name: "web", scopes: ["requests:write", "requests:read"] });
    const invalid = await json(await requestsRoute.POST(req("POST", "/customer-requests", { key: key.secret, body: { title: "ab" } })));
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("validation_error");
    expect(invalid.body.error.details[0].path).toBe("title");
    const badJson = await json(await requestsRoute.POST(req("POST", "/customer-requests", { key: key.secret, raw: "{nicht json" })));
    expect(badJson.status).toBe(400);
    expect(badJson.body.error.code).toBe("invalid_json");

    const payload = { title: "Firmenfeier Hafencity", contactEmail: "m@example.com", startsAt: "2027-11-20T17:00:00+01:00", endsAt: "2027-11-21T01:00:00+01:00", locationText: "Hamburg", headcount: 6 };
    const created = await json(await requestsRoute.POST(req("POST", "/customer-requests", { key: key.secret, body: payload })));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("new");
    expect(created.body.source).toBe("api");
    expect(created.body.duplicate).toBe(false);
    expect(created.body.missingFields).toEqual(["customerId"]);

    const dup = await json(await requestsRoute.POST(req("POST", "/customer-requests", { key: key.secret, body: payload })));
    expect(dup.status).toBe(201);
    expect(dup.body.duplicate).toBe(true);
    expect(dup.body.duplicateOfId).toBe(created.body.id);

    const ext1 = await json(await requestsRoute.POST(req("POST", "/customer-requests", { key: key.secret, body: { title: "Messe Stand", externalRef: "web-42" } })));
    const ext2 = await json(await requestsRoute.POST(req("POST", "/customer-requests", { key: key.secret, body: { title: "Messe Stand (nochmal)", externalRef: "web-42" } })));
    expect(ext1.status).toBe(201);
    expect(ext2.status).toBe(200);
    expect(ext2.body.id).toBe(ext1.body.id);

    const idem1 = await json(await requestsRoute.POST(req("POST", "/customer-requests", { key: key.secret, body: { title: "Idempotent" }, headers: { "idempotency-key": "abc-1" } })));
    const idem2 = await requestsRoute.POST(req("POST", "/customer-requests", { key: key.secret, body: { title: "Idempotent" }, headers: { "idempotency-key": "abc-1" } }));
    expect(idem1.status).toBe(201);
    expect(idem2.status).toBe(201);
    expect(idem2.headers.get("idempotent-replayed")).toBe("true");
    expect((await idem2.json()).id).toBe(idem1.body.id);
    const mismatch = await json(await requestsRoute.POST(req("POST", "/customer-requests", { key: key.secret, body: { title: "Anderer Inhalt" }, headers: { "idempotency-key": "abc-1" } })));
    expect(mismatch.status).toBe(422);

    const list = await json(await requestsRoute.GET(req("GET", "/customer-requests?status=all&pageSize=2", { key: key.secret })));
    expect(list.body.total).toBe(4);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.totalPages).toBe(2);
    const one = await json(await requestRoute.GET(req("GET", `/customer-requests/${created.body.id}`, { key: key.secret }), params({ id: created.body.id })));
    expect(one.body.title).toBe("Firmenfeier Hafencity");
    const patched = await json(await requestRoute.PATCH(req("PATCH", `/customer-requests/${created.body.id}`, { key: key.secret, body: { status: "in_review" } }), params({ id: created.body.id })));
    expect(patched.body.status).toBe("in_review");
  });

  it("Szenario 11: fremder Mandant erreicht keine Daten über IDs", async () => {
    resetRateLimits();
    const a = await makeTenant();
    const b = await makeTenant();
    const keyA = await createApiKey(a.ctx, { name: "key-a", scopes: ["events:read", "events:write", "customers:read"] });
    const keyB = await createApiKey(b.ctx, { name: "key-b", scopes: ["events:read", "events:write", "requests:write"] });
    const cust = await createCustomer(a.ctx, { name: "Kunde A", status: "active" });
    const ev = await json(await eventsRoute.POST(req("POST", "/events", { key: keyA.secret, body: { customerId: cust.id, name: "Nur A", startsAt: "2027-05-01T10:00:00Z", endsAt: "2027-05-01T18:00:00Z" } })));
    expect(ev.status).toBe(201);
    const fromB = await json(await eventRoute.GET(req("GET", `/events/${ev.body.id}`, { key: keyB.secret }), params({ id: ev.body.id })));
    expect(fromB.status).toBe(404);
    const listB = await json(await eventsRoute.GET(req("GET", "/events?status=all", { key: keyB.secret })));
    expect(listB.body.items.find((e: { id: string }) => e.id === ev.body.id)).toBeUndefined();
    const patchB = await json(await eventRoute.PATCH(req("PATCH", `/events/${ev.body.id}`, { key: keyB.secret, body: { name: "gekapert" } }), params({ id: ev.body.id })));
    expect(patchB.status).toBe(404);
    // B kann keine Veranstaltung für A's Kunden anlegen
    const createB = await json(await eventsRoute.POST(req("POST", "/events", { key: keyB.secret, body: { customerId: cust.id, name: "Fremd", startsAt: "2027-05-01T10:00:00Z", endsAt: "2027-05-01T18:00:00Z" } })));
    expect(createB.status).toBe(404);
    const stillA = await json(await eventRoute.GET(req("GET", `/events/${ev.body.id}`, { key: keyA.secret }), params({ id: ev.body.id })));
    expect(stillA.body.name).toBe("Nur A");
  });

  it("Planung über API: Position, Slot, Zuweisung mit Konflikt (409), Import + Abgleich", async () => {
    resetRateLimits();
    const f = await makeTenant();
    const key = await createApiKey(f.ctx, { name: "integration", scopes: ["events:read", "events:write", "shifts:read", "shifts:write", "shifts:assign", "time:import", "time:read"] });
    const cust = await createCustomer(f.ctx, { name: "API Kunde", status: "active" });
    const emp = await createEmployee(f.ctx, { employeeNumber: "A-1", firstName: "Api", lastName: "Tester", status: "active", areas: [] });
    const ev = await json(await eventsRoute.POST(req("POST", "/events", { key: key.secret, body: { customerId: cust.id, name: "API Event", startsAt: "2026-08-01T08:00:00Z", endsAt: "2026-08-01T16:00:00Z" } })));
    const pos = await json(await positionsRoute.POST(req("POST", `/events/${ev.body.id}/positions`, { key: key.secret, body: { name: "Tor", headcountRequired: 1, startsAt: "2026-08-01T08:00:00Z", endsAt: "2026-08-01T16:00:00Z" } }), params({ id: ev.body.id })));
    expect(pos.status).toBe(201);
    const slots = await json(await shiftsRoute.GET(req("GET", `/shifts?positionId=${pos.body.id}`, { key: key.secret })));
    expect(slots.body.items).toHaveLength(1);
    const extra = await json(await shiftsRoute.POST(req("POST", "/shifts", { key: key.secret, body: { positionId: pos.body.id } })));
    expect(extra.status).toBe(201);
    const s1 = slots.body.items[0].id as string;
    const assigned = await json(await assignRoute.POST(req("POST", `/shifts/${s1}/assign`, { key: key.secret, body: { employeeId: emp.id, mode: "direct" } }), params({ id: s1 })));
    expect(assigned.status).toBe(200);
    expect(assigned.body.status).toBe("confirmed");
    const conflict = await json(await assignRoute.POST(req("POST", `/shifts/${extra.body.id}/assign`, { key: key.secret, body: { employeeId: emp.id, mode: "direct" } }), params({ id: extra.body.id })));
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.details.conflicts[0].type).toBe("double_booking");

    const imp = await json(await importRoute.POST(req("POST", "/time-records/import", { key: key.secret, body: { rows: [{ employeeNumber: "A-1", startedAt: "2026-08-01T08:00:00Z", endedAt: "2026-08-01T17:00:00Z" }] } })));
    expect(imp.status).toBe(201);
    expect(imp.body.reference).toMatch(/^IMP-/);
    expect(imp.body.reconciliation.deviations).toBe(1);
    const items = await json(await reconRoute.GET(req("GET", "/reconciliation-items?status=open", { key: key.secret })));
    expect(items.body.items[0].deviationMinutes).toBe(60);
  });
});
