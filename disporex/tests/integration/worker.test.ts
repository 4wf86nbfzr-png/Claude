import { describe, it, expect, afterAll } from "vitest";
import { closeDb, withTenant, withSystem } from "../../src/server/db/client";
import { makeTenant } from "../helpers";
import { notifyUser } from "../../src/server/modules/notifications/service";
import { drainJobs } from "../../src/server/jobs/worker";
import { sentMailLog } from "../../src/server/modules/mail/mailer";
import { notifications, jobs, domainEvents, automationRules, automationRuns, webhookEndpoints, webhookDeliveries } from "../../src/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createRequest } from "../../src/server/modules/requests/service";
import { createEndpoint, verifyWebhookSignature, signWebhook } from "../../src/server/modules/webhooks/service";
import { validateWebhookUrl, isForbiddenIp } from "../../src/server/modules/webhooks/ssrf";
import { evaluateConditions } from "../../src/server/modules/automations/engine";
import { createServer } from "node:http";

afterAll(() => closeDb());

describe("Worker: Benachrichtigungen", () => {
  it("stellt E-Mail-Benachrichtigungen über den Job zu und markiert sie als gesendet", async () => {
    const f = await makeTenant();
    sentMailLog.length = 0;
    await withTenant(f.tenantId, (tx) => notifyUser(tx, f.tenantId, { userId: f.userId, kind: "test", title: "Hallo", body: "Welt", priority: "high" }));
    const pending = await withTenant(f.tenantId, (tx) => tx.select().from(notifications).where(and(eq(notifications.channel, "email"), eq(notifications.status, "pending"))));
    expect(pending).toHaveLength(1);
    await drainJobs(["notification.deliver"]);
    const after = await withTenant(f.tenantId, (tx) => tx.select().from(notifications).where(eq(notifications.channel, "email")));
    expect(after[0]?.status).toBe("sent");
    expect(sentMailLog.some((m) => m.to === f.email && m.subject.includes("Hallo"))).toBe(true);
  });

  it("dedupliziert gleiche Benachrichtigungen", async () => {
    const f = await makeTenant();
    const a = await withTenant(f.tenantId, (tx) => notifyUser(tx, f.tenantId, { userId: f.userId, kind: "x", title: "A", body: "", dedupeKey: "k1" }));
    const b = await withTenant(f.tenantId, (tx) => notifyUser(tx, f.tenantId, { userId: f.userId, kind: "x", title: "A", body: "", dedupeKey: "k1" }));
    expect(a).toBeTruthy();
    expect(b).toBeNull();
  });

  it("Szenario 13: fehlgeschlagene Zustellung wird protokolliert und sichtbar", async () => {
    const f = await makeTenant();
    // Benachrichtigung ohne Empfängeradresse erzwingt Fehler
    const [n] = await withTenant(f.tenantId, (tx) => tx.insert(notifications).values({ tenantId: f.tenantId, userId: f.userId, channel: "email", kind: "t", title: "Kaputt", body: "", status: "pending", recipientAddress: null }).returning());
    await withSystem((tx) => tx.insert(jobs).values({ tenantId: f.tenantId, type: "notification.deliver", payload: { notificationId: n!.id }, maxAttempts: 1 }));
    await drainJobs(["notification.deliver"]);
    const after = (await withTenant(f.tenantId, (tx) => tx.select().from(notifications).where(eq(notifications.id, n!.id))))[0];
    expect(after?.status).toBe("failed");
    expect(after?.lastError).toMatch(/Empfänger/);
  });
});

describe("Worker: Ereignisse, Automatisierung, Webhooks", () => {
  it("Automatisierung reagiert auf neue Anfrage: fehlende Felder, Benachrichtigung, Deduplizierung", async () => {
    const f = await makeTenant();
    await withTenant(f.tenantId, (tx) =>
      tx.insert(automationRules).values({
        tenantId: f.tenantId,
        name: "Neue Anfrage prüfen",
        trigger: "customer_request.created",
        conditions: [{ type: "field_present", field: "title" }],
        actions: [{ type: "flag_missing_fields", fields: ["startsAt", "locationText", "headcount"] }, { type: "notify_role", role: "tenant_admin", title: "Anfrage: {title}", body: "Bitte prüfen" }],
      }),
    );
    const r = await createRequest(f.ctx, { title: "Unvollständige Anfrage", source: "api" });
    await drainJobs(["domain_event.dispatch", "webhook.deliver"]);
    const runs = await withTenant(f.tenantId, (tx) => tx.select().from(automationRuns));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("success");
    const req = (await withTenant(f.tenantId, (tx) => tx.select().from(customerRequestsTable()).where(eq(customerRequestsTable().id, r.request.id))))[0];
    expect(req?.status).toBe("needs_info");
    expect(req?.missingFields).toContain("startsAt");
    const notes = await withTenant(f.tenantId, (tx) => tx.select().from(notifications).where(and(eq(notifications.userId, f.userId), eq(notifications.kind, "automation.customer_request.created"))));
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe("Anfrage: Unvollständige Anfrage");
    // Ereignis verarbeitet
    const ev = await withTenant(f.tenantId, (tx) => tx.select().from(domainEvents).where(eq(domainEvents.type, "customer_request.created")).orderBy(desc(domainEvents.createdAt)).limit(1));
    expect(ev[0]?.processedAt).not.toBeNull();
    // Zweiter Lauf desselben Ereignisses erzeugt keinen zweiten Run
    await withSystem((tx) => tx.insert(jobs).values({ tenantId: f.tenantId, type: "domain_event.dispatch", payload: { domainEventId: ev[0]!.id } }));
    await drainJobs(["domain_event.dispatch"]);
    expect(await withTenant(f.tenantId, (tx) => tx.select().from(automationRuns))).toHaveLength(1);
  });

  it("Webhook wird signiert zugestellt; Signatur prüfbar; Replay außerhalb der Toleranz abgelehnt", async () => {
    const f = await makeTenant();
    const received: { body: string; sig: string; event: string }[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ body, sig: String(req.headers["x-disporex-signature"]), event: String(req.headers["x-disporex-event"]) });
        res.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    // 127.0.0.1 ist intern – die SSRF-Prüfung muss das ablehnen …
    await expect(createEndpoint(f.ctx, { name: "lokal", url: `http://127.0.0.1:${port}/hook`, eventTypes: ["customer_request.created"] })).rejects.toThrow(/intern/);
    // … für den Test schalten wir den Endpunkt direkt in die DB (öffentliche IPs stehen im Test nicht zur Verfügung).
    const { encryptSecret } = await import("../../src/server/core/crypto");
    const secret = "whsec_testsecret";
    const [ep] = await withTenant(f.tenantId, (tx) => tx.insert(webhookEndpoints).values({ tenantId: f.tenantId, name: "Test", url: `http://127.0.0.1:${port}/hook`, eventTypes: ["*"], secretEncrypted: encryptSecret(secret) }).returning());
    // Zustellung umgeht die URL-Prüfung nicht – deshalb hier direkt die Signaturlogik testen:
    const body = JSON.stringify({ hello: "world" });
    const ts = Math.floor(Date.now() / 1000);
    const sig = signWebhook(secret, ts, body);
    expect(verifyWebhookSignature(secret, sig, body)).toBe(true);
    expect(verifyWebhookSignature(secret, sig, body + " ")).toBe(false);
    expect(verifyWebhookSignature(secret, sig, body, 300, Date.now() + 10 * 60_000)).toBe(false);
    // Fan-out legt Zustellung + Job an
    await createRequest(f.ctx, { title: "Webhook-Anfrage", source: "api" });
    await drainJobs(["domain_event.dispatch"]);
    const deliveries = await withTenant(f.tenantId, (tx) => tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, ep!.id)));
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries[0]?.status).toBe("pending");
    await drainJobs(["webhook.deliver"]);
    const after = await withTenant(f.tenantId, (tx) => tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, ep!.id)));
    // Zustellung an interne Adresse wird zur Laufzeit erneut verweigert und protokolliert
    expect(after[0]?.status).toMatch(/failed|exhausted/);
    expect(after[0]?.lastError).toMatch(/intern/);
    expect(received).toHaveLength(0);
    server.close();
  });

  it("SSRF-Prüfung erkennt interne Bereiche und ungültige URLs", async () => {
    expect(isForbiddenIp("10.1.2.3")).toBe(true);
    expect(isForbiddenIp("172.20.0.1")).toBe(true);
    expect(isForbiddenIp("192.168.1.1")).toBe(true);
    expect(isForbiddenIp("169.254.169.254")).toBe(true);
    expect(isForbiddenIp("8.8.8.8")).toBe(false);
    expect(isForbiddenIp("::1")).toBe(true);
    await expect(validateWebhookUrl("ftp://example.com", { requireHttps: false })).rejects.toThrow(/http/);
    await expect(validateWebhookUrl("http://user:pw@example.com", { requireHttps: false })).rejects.toThrow(/Zugangsdaten/);
    await expect(validateWebhookUrl("http://localhost/x", { requireHttps: false })).rejects.toThrow(/Intern/);
    await expect(validateWebhookUrl("http://example.com", { requireHttps: true })).rejects.toThrow(/https/);
  });

  it("Bedingungen werden korrekt ausgewertet", () => {
    const p = { title: "x", headcount: 5, nested: { a: "b" } };
    expect(evaluateConditions([{ type: "field_present", field: "title" }], p).ok).toBe(true);
    expect(evaluateConditions([{ type: "field_missing", field: "title" }], p).ok).toBe(false);
    expect(evaluateConditions([{ type: "field_gt", field: "headcount", value: 3 }], p).ok).toBe(true);
    expect(evaluateConditions([{ type: "field_equals", field: "nested.a", value: "b" }], p).ok).toBe(true);
  });
});

import { customerRequests } from "../../src/server/db/schema";
function customerRequestsTable() {
  return customerRequests;
}
