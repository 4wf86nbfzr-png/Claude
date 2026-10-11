import { describe, it, expect } from "vitest";
import { seedDemo } from "../../src/server/db/seed";
import { withSystem } from "../../src/server/db/client";
import { tenants, employees, events, shifts, reconciliationItems, rateCards, customerRequests, automationRules } from "../../src/server/db/schema";
import { eq, and } from "drizzle-orm";
import { login } from "../../src/server/auth/service";

describe("Seed (synthetische Demodaten)", () => {
  it("baut einen vollständigen Demo-Mandanten auf, Konten können sich anmelden, zweiter Lauf wird abgewiesen", async () => {
    const { tenantId, password } = await seedDemo({ password: "Seed-Test-Passwort-1" });
    expect(password).toBe("Seed-Test-Passwort-1");
    const counts = await withSystem(async (tx) => ({
      tenant: (await tx.select().from(tenants).where(eq(tenants.id, tenantId))).length,
      employees: (await tx.select().from(employees).where(eq(employees.tenantId, tenantId))).length,
      events: (await tx.select().from(events).where(eq(events.tenantId, tenantId))).length,
      confirmed: (await tx.select().from(shifts).where(and(eq(shifts.tenantId, tenantId), eq(shifts.status, "confirmed")))).length,
      open: (await tx.select().from(shifts).where(and(eq(shifts.tenantId, tenantId), eq(shifts.status, "open")))).length,
      reconciliation: (await tx.select().from(reconciliationItems).where(eq(reconciliationItems.tenantId, tenantId))).length,
      rateCards: (await tx.select().from(rateCards).where(eq(rateCards.tenantId, tenantId))).length,
      requests: (await tx.select().from(customerRequests).where(eq(customerRequests.tenantId, tenantId))).length,
      rules: (await tx.select().from(automationRules).where(eq(automationRules.tenantId, tenantId))).length,
    }));
    expect(counts.tenant).toBe(1);
    expect(counts.employees).toBe(12);
    expect(counts.events).toBe(4);
    expect(counts.confirmed).toBe(5); // 3 vergangene Einlasskräfte + 2 Logistiker (direkt zugesagt)
    expect(counts.open).toBe(12); // Sommerfest 9 + Standsicherheit 1 + Lager 2
    expect(counts.reconciliation).toBe(3); // 1 Treffer, 1 Abweichung, 1 fehlend
    expect(counts.rateCards).toBe(4);
    expect(counts.requests).toBe(2);
    expect(counts.rules).toBeGreaterThan(0);

    const session = await login({ email: "admin@disporex.example", password: "Seed-Test-Passwort-1" }, { ip: "127.0.0.1" });
    expect(session).toBeTruthy();

    await expect(seedDemo({ password: "x" })).rejects.toThrow(/existiert bereits/);
  });
});
