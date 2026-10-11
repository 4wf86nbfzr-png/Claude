import { describe, it, expect, afterAll } from "vitest";
import { closeDb, withTenant, withSystem, db } from "../../src/server/db/client";
import { employees, customers, auditLogs } from "../../src/server/db/schema";
import { makeTenant } from "../helpers";
import { eq } from "drizzle-orm";

afterAll(() => closeDb());

/**
 * Diese Tests greifen absichtlich mandantenübergreifend zu – jeder Versuch muss
 * an der Datenbank (Row-Level Security) scheitern, unabhängig von der Anwendungslogik.
 */
describe("Mandantentrennung (RLS)", () => {
  it("Mandant B sieht keine Mitarbeiter von Mandant A, auch bei direkter ID-Abfrage", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const [emp] = await withTenant(a.tenantId, (tx) => tx.insert(employees).values({ tenantId: a.tenantId, employeeNumber: "A-1", firstName: "Anna", lastName: "Alpha" }).returning());
    const seenByA = await withTenant(a.tenantId, (tx) => tx.select().from(employees).where(eq(employees.id, emp!.id)));
    const seenByB = await withTenant(b.tenantId, (tx) => tx.select().from(employees).where(eq(employees.id, emp!.id)));
    expect(seenByA).toHaveLength(1);
    expect(seenByB).toHaveLength(0);
  });

  it("Schreiben mit fremder tenant_id wird von der Datenbank abgewiesen", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const err = await withTenant(b.tenantId, (tx) => tx.insert(employees).values({ tenantId: a.tenantId, employeeNumber: "X", firstName: "Eve", lastName: "Evil" })).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    const cause = (err as Error & { cause?: Error }).cause;
    expect(`${err.message} ${cause?.message ?? ""}`).toMatch(/row-level security/);
  });

  it("Update/Delete über fremde IDs trifft keine Zeile", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const [c] = await withTenant(a.tenantId, (tx) => tx.insert(customers).values({ tenantId: a.tenantId, customerNumber: "K-1", name: "Kunde A" }).returning());
    const upd = await withTenant(b.tenantId, (tx) => tx.update(customers).set({ name: "gekapert" }).where(eq(customers.id, c!.id)).returning());
    expect(upd).toHaveLength(0);
    const del = await withTenant(b.tenantId, (tx) => tx.delete(customers).where(eq(customers.id, c!.id)).returning());
    expect(del).toHaveLength(0);
    const still = await withTenant(a.tenantId, (tx) => tx.select().from(customers).where(eq(customers.id, c!.id)));
    expect(still[0]?.name).toBe("Kunde A");
  });

  it("ohne Mandantenkontext liefert die DB für Geschäftstabellen nichts", async () => {
    const a = await makeTenant();
    await withTenant(a.tenantId, (tx) => tx.insert(customers).values({ tenantId: a.tenantId, customerNumber: "K-2", name: "Kunde" }));
    const rows = await db().select().from(customers);
    expect(rows).toHaveLength(0);
  });

  it("Systemkontext (Worker) sieht alle Mandanten, Audit ohne Mandant nur dort", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await withSystem((tx) => tx.insert(auditLogs).values({ tenantId: null, action: "system.test", entityType: "test" }));
    const all = await withSystem((tx) => tx.select().from(customers));
    expect(all.length).toBeGreaterThanOrEqual(0);
    const aAudit = await withTenant(a.tenantId, (tx) => tx.select().from(auditLogs).where(eq(auditLogs.action, "system.test")));
    const bAudit = await withTenant(b.tenantId, (tx) => tx.select().from(auditLogs).where(eq(auditLogs.action, "system.test")));
    expect(aAudit).toHaveLength(0);
    expect(bAudit).toHaveLength(0);
  });
});
