import { describe, it, expect, afterAll } from "vitest";
import { closeDb, withTenant } from "../../src/server/db/client";
import { makeTenant, asRole } from "../helpers";
import { createEmployee } from "../../src/server/modules/employees/service";
import { createCustomer } from "../../src/server/modules/customers/service";
import { createEvent, createPosition, getEvent, ensureOrder, setOrderStatus, setEventStatus } from "../../src/server/modules/events/service";
import { assignShift } from "../../src/server/modules/shifts/service";
import { importTimeRecords, listReconciliation, approveItem } from "../../src/server/modules/time/service";
import { runReport, exportReportCsv } from "../../src/server/modules/reports/service";
import { createRateCard, createSurchargeRule, generateBillingItems, listBillingItems, finalizeBillingItems, surchargeMinutes, deleteRateCard, listRateCards, exportBillingCsv } from "../../src/server/modules/billing/service";
import { globalSearch } from "../../src/server/modules/search/service";
import { surchargeRules } from "../../src/server/db/schema";

afterAll(() => closeDb());
const d = (iso: string) => new Date(iso);

async function setup() {
  const f = await makeTenant();
  const dispo = asRole(f, "dispatcher");
  const acc = asRole(f, "accounting");
  const anna = await createEmployee(f.ctx, { employeeNumber: "B-1", firstName: "Anna", lastName: "Bill", status: "active", areas: [] });
  const cust = await createCustomer(f.ctx, { name: "Billkunde GmbH", status: "active" });
  // Samstag 10.01.2026 20:00 – Sonntag 02:00 Berlin = 19:00–01:00 UTC
  const ev = await createEvent(dispo, { customerId: cust.id, name: "Silvester-Nachlese", startsAt: d("2026-01-10T19:00:00Z"), endsAt: d("2026-01-11T01:00:00Z") });
  const pos = await createPosition(dispo, ev.id, { name: "Einlass", headcountRequired: 1, startsAt: d("2026-01-10T19:00:00Z"), endsAt: d("2026-01-11T01:00:00Z"), breakMinutes: 0, requiredQualificationIds: [], billingCategory: "security" });
  const detail = await getEvent(dispo, ev.id);
  const slot = detail.positions[0]!.shifts[0]!;
  await assignShift(dispo, slot.id, { employeeId: anna.id, mode: "direct" });
  await setEventStatus(dispo, ev.id, "planned");
  const order = await ensureOrder(dispo, ev.id);
  await setOrderStatus(dispo, order.id, "confirmed");
  return { f, dispo, acc, anna, cust, ev, pos, slot };
}

describe("Berichte", () => {
  it("Besetzung, Stunden, Kunden und Auftragsbericht liefern nachvollziehbare Zahlen; Vorläufigkeit wird gekennzeichnet", async () => {
    const { f, cust } = await setup();
    const range = { from: d("2026-01-01T00:00:00Z"), to: d("2026-01-31T23:59:59Z") };
    const staffing = await runReport(f.ctx, "staffing", range);
    expect(staffing.summary["Besetzungsquote %"]).toBe(100);
    expect(staffing.rows[0]?.filled).toBe(1);
    expect(staffing.preliminary).toBe(true); // Veranstaltung nicht abgeschlossen
    const hours = await runReport(f.ctx, "hours", range);
    expect(hours.rows[0]?.plannedH).toBe(6);
    expect(hours.rows[0]?.approvedH).toBe(0);
    const customersR = await runReport(f.ctx, "customers", range);
    expect(customersR.rows[0]?.customer).toBe("Billkunde GmbH");
    const ordersR = await runReport(f.ctx, "orders", { from: d("2020-01-01T00:00:00Z"), to: new Date(Date.now() + 86_400_000) });
    expect(ordersR.summary.confirmed).toBe(1);
    const csv = await exportReportCsv(f.ctx, "staffing", range);
    expect(csv).toContain("Vorläufig");
    expect(csv).toContain("Silvester-Nachlese");
    void cust;
    await expect(runReport(asRole(f, "employee"), "staffing", range)).rejects.toThrow(/Berechtigung/);
  });
});

describe("Abrechnungsvorbereitung", () => {
  it("Zuschlagsminuten: Nacht über Mitternacht, Samstag/Sonntag, Feiertag", () => {
    const base = { id: "x", tenantId: "t", name: "r", percent: 25, fromTime: null as string | null, toTime: null as string | null, holidays: [] as string[], validFrom: "2020-01-01", validTo: null as string | null, createdAt: new Date(), updatedAt: new Date() };
    const start = d("2026-01-10T19:00:00Z"); // Sa 20:00 Berlin
    const end = d("2026-01-11T01:00:00Z"); // So 02:00 Berlin
    expect(surchargeMinutes(start, end, { ...base, kind: "night", fromTime: "22:00", toTime: "06:00" })).toBe(240); // 22–02 Uhr
    expect(surchargeMinutes(start, end, { ...base, kind: "saturday" })).toBe(240); // 20–24 Uhr
    expect(surchargeMinutes(start, end, { ...base, kind: "sunday" })).toBe(120); // 0–2 Uhr
    expect(surchargeMinutes(start, end, { ...base, kind: "holiday", holidays: ["2026-01-11"] })).toBe(120);
    expect(surchargeMinutes(start, end, { ...base, kind: "sunday", validFrom: "2027-01-01" })).toBe(0);
  });

  it("Stundensätze mit Gültigkeit, keine rückwirkende Änderung, vorläufige und finale Grundlagen", async () => {
    const { f, acc, cust, slot } = await setup();
    const old = await createRateCard(acc, { customerId: cust.id, billingCategory: "security", label: "Security 2025", hourlyRateCents: 3000, validFrom: "2025-01-01" });
    const current = await createRateCard(acc, { customerId: cust.id, billingCategory: "security", label: "Security 2026", hourlyRateCents: 3500, validFrom: "2026-01-01" });
    const cards = await listRateCards(acc);
    expect(cards.find((c) => c.r.id === old.id)?.r.validTo).toBe("2025-12-31"); // Vorgänger beendet, nicht überschrieben
    await createSurchargeRule(acc, { name: "Nacht", kind: "night", percent: 25, fromTime: "22:00", toTime: "06:00", holidays: [], validFrom: "2020-01-01" });
    await createSurchargeRule(acc, { name: "Sonntag", kind: "sunday", percent: 50, holidays: [], validFrom: "2020-01-01" });
    const range = { from: d("2026-01-01T00:00:00Z"), to: d("2026-01-31T23:59:59Z") };
    const g1 = await generateBillingItems(acc, cust.id, range);
    expect(g1.generated).toBe(1);
    expect(g1.preliminary).toBe(1);
    let items = await listBillingItems(acc, { customerId: cust.id });
    expect(items[0]?.b.rateCardId).toBe(current.id);
    expect(items[0]?.b.hourlyRateCents).toBe(3500);
    expect(items[0]?.b.plannedMinutes).toBe(360);
    // 6 h * 35 € = 210 € + Nacht 4 h * 35 * 25 % = 35 € + Sonntag 2 h * 35 * 50 % = 35 € => 280 €
    expect(items[0]?.b.totalCents).toBe(28000);
    expect(items[0]?.b.status).toBe("preliminary");
    // Finalisieren ohne Ist-Zeit nicht möglich
    const fin0 = await finalizeBillingItems(acc, [items[0]!.b.id]);
    expect(fin0.finalized).toBe(0);
    // Ist-Zeit über Import + Bestätigung: 30 Minuten länger
    await importTimeRecords(acc, { filename: "z.csv", data: Buffer.from("employee_number;start;end\nB-1;2026-01-10T20:00:00+01:00;2026-01-11T02:30:00+01:00\n") });
    const open = await listReconciliation(acc, { status: "open" });
    await approveItem(acc, open.items[0]!.it.id);
    const g2 = await generateBillingItems(acc, cust.id, range);
    expect(g2.updated).toBe(1);
    expect(g2.preliminary).toBe(0);
    items = await listBillingItems(acc, { customerId: cust.id });
    expect(items[0]?.b.approvedMinutes).toBe(390);
    const fin = await finalizeBillingItems(acc, [items[0]!.b.id]);
    expect(fin.finalized).toBe(1);
    // Finale Grundlage bleibt bei erneuter Generierung unverändert, Satz nicht löschbar
    const g3 = await generateBillingItems(acc, cust.id, range);
    expect(g3.skippedFinal).toBe(1);
    await expect(deleteRateCard(acc, current.id)).rejects.toThrow(/verwendet/);
    const csv = await exportBillingCsv(acc, { customerId: cust.id });
    expect(csv).toContain("final");
    expect(csv).toContain("Billkunde GmbH");
    void slot;
    const rules = await withTenant(f.tenantId, (tx) => tx.select().from(surchargeRules));
    expect(rules).toHaveLength(2);
    // Disponent darf keine Sätze pflegen
    await expect(createRateCard(asRole(f, "dispatcher"), { label: "x", hourlyRateCents: 1, validFrom: "2026-01-01" })).rejects.toThrow(/Berechtigung/);
  });
});

describe("Suche", () => {
  it("findet nur Daten des eigenen Mandanten und nur in erlaubten Bereichen", async () => {
    const { f, dispo } = await setup();
    const other = await makeTenant();
    await createCustomer(other.ctx, { name: "Billkunde Fremd", status: "active" });
    const r = await globalSearch(dispo, "Billkunde");
    expect(r.groups.Kunden).toHaveLength(1);
    expect(r.groups.Kunden?.[0]?.title).toBe("Billkunde GmbH");
    expect(r.groups.Veranstaltungen).toHaveLength(1);
    const hr = await globalSearch(asRole(f, "hr"), "Silvester");
    expect(hr.groups.Veranstaltungen).toHaveLength(1);
    expect(hr.groups.Aufträge).toBeUndefined(); // kein orders:read
    await expect(globalSearch(asRole(f, "employee"), "x")).rejects.toThrow(/Berechtigung/);
    expect((await globalSearch(dispo, "B")).hits).toHaveLength(0);
  });
});
