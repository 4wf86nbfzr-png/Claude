import { describe, it, expect, afterAll } from "vitest";
import { closeDb, withTenant } from "../../src/server/db/client";
import { makeTenant, asRole } from "../helpers";
import { createEmployee } from "../../src/server/modules/employees/service";
import { createCustomer } from "../../src/server/modules/customers/service";
import { createEvent, createPosition, getEvent } from "../../src/server/modules/events/service";
import { assignShift } from "../../src/server/modules/shifts/service";
import { importTimeRecords, listReconciliation, approveItem, correctItem, getReconciliationItem, createManualRecord, exportReconciliationCsv, rejectItem } from "../../src/server/modules/time/service";
import { parseCsvTimeRecords, parseXlsxTimeRecords, detectMapping } from "../../src/server/modules/time/parse";
import { shifts, timeRecords } from "../../src/server/db/schema";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";

afterAll(() => closeDb());

const d = (iso: string) => new Date(iso);

async function setup() {
  const f = await makeTenant();
  const dispo = asRole(f, "dispatcher");
  const anna = await createEmployee(f.ctx, { employeeNumber: "P-100", firstName: "Anna", lastName: "Zeit", status: "active", areas: [] });
  const cust = await createCustomer(f.ctx, { name: "Zeitkunde", status: "active" });
  // Vergangene Veranstaltung mit bestätigter Schicht 14:00–22:00 (Berlin = 12:00–20:00 UTC im Sommer)
  const ev = await createEvent(dispo, { customerId: cust.id, name: "Nachtmarkt", startsAt: d("2026-07-10T12:00:00Z"), endsAt: d("2026-07-10T20:00:00Z") });
  const pos = await createPosition(dispo, ev.id, { name: "Einlass", headcountRequired: 2, startsAt: d("2026-07-10T12:00:00Z"), endsAt: d("2026-07-10T20:00:00Z"), breakMinutes: 0, requiredQualificationIds: [] });
  const detail = await getEvent(dispo, ev.id);
  const slot = detail.positions[0]!.shifts[0]!;
  await assignShift(dispo, slot.id, { employeeId: anna.id, mode: "direct" });
  return { f, dispo, anna, cust, ev, pos, slot };
}

describe("Zeitnachweis-Parser", () => {
  it("erkennt deutsche und englische Spalten, Datum+Uhrzeit, über Mitternacht", () => {
    const csv = "Personalnummer;Datum;Beginn;Ende;Pause\nP-100;10.07.2026;22:00;02:30;30\n";
    const r = parseCsvTimeRecords(csv);
    expect(r.errors).toHaveLength(0);
    expect(r.rows[0]!.employeeNumber).toBe("P-100");
    expect(r.rows[0]!.startedAt.toISOString()).toBe("2026-07-10T20:00:00.000Z");
    expect(r.rows[0]!.endedAt.toISOString()).toBe("2026-07-11T00:30:00.000Z");
    expect(r.rows[0]!.breakMinutes).toBe(30);
    expect(detectMapping(["employee_number", "start", "end"])).toMatchObject({ employeeNumber: "employee_number", start: "start", end: "end" });
  });
  it("meldet Zeilenfehler statt abzubrechen", () => {
    const csv = "employee_number,date,start,end\nP-100,2026-07-10,14:00,22:00\n,2026-07-10,14:00,22:00\nP-100,2026-07-10,xx,22:00\n";
    const r = parseCsvTimeRecords(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(2);
  });
  it("liest XLSX", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Zeiten");
    ws.addRow(["Mitarbeiter-ID", "Datum", "Von", "Bis"]);
    ws.addRow(["P-100", "2026-07-10", "14:00", "22:30"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await parseXlsxTimeRecords(buf);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.endedAt.toISOString()).toBe("2026-07-10T20:30:00.000Z");
  });
});

describe("Szenarien 8–10: Import, Abweichung, Korrektur/Bestätigung", () => {
  it("importiert, ordnet zu, erkennt 30 Minuten Abweichung und Duplikate", async () => {
    const { f, anna } = await setup();
    const acc = asRole(f, "accounting");
    const csv = "employee_number;date;start;end;break\nP-100;10.07.2026;14:00;22:30;0\nP-999;10.07.2026;10:00;12:00;0\n";
    const r = await importTimeRecords(acc, { filename: "zeiten.csv", data: Buffer.from(csv) });
    expect(r.reference).toMatch(/^IMP-\d{4}-\d{6}$/);
    expect(r.imported).toBe(2);
    expect(r.unmatchedEmployees).toEqual(["P-999"]);
    expect(r.reconciliation.deviations).toBe(1);
    const open = await listReconciliation(acc, { status: "open", kind: "deviation" });
    expect(open.total).toBe(1);
    const item = open.items[0]!.it;
    expect(item.deviationMinutes).toBe(30);
    expect(item.plannedEnd?.toISOString()).toBe("2026-07-10T20:00:00.000Z");
    expect(item.actualEnd?.toISOString()).toBe("2026-07-10T20:30:00.000Z");
    expect(item.employeeId).toBe(anna.id);
    // Gleiche Datei erneut: abgewiesen
    await expect(importTimeRecords(acc, { filename: "zeiten.csv", data: Buffer.from(csv) })).rejects.toThrow(/bereits importiert/);
    // Gleiche Zeilen in anderer Datei: Duplikate übersprungen, keine Doppelbuchung
    const r2 = await importTimeRecords(acc, { filename: "zeiten2.csv", data: Buffer.from(csv + "P-100;11.07.2026;09:00;12:00;0\n") });
    expect(r2.duplicates).toBe(2);
    expect(r2.imported).toBe(1);
    expect(r2.reconciliation.unplanned).toBe(1);
    const recs = await withTenant(f.tenantId, (tx) => tx.select().from(timeRecords));
    expect(recs).toHaveLength(3);
  });

  it("Übereinstimmung innerhalb Toleranz wird automatisch bestätigt; fehlender Nachweis erkannt", async () => {
    const { f, dispo, ev, cust } = await setup();
    // zweiter Mitarbeiter mit bestätigter Schicht, aber ohne Nachweis
    const ben = await createEmployee(f.ctx, { employeeNumber: "P-200", firstName: "Ben", lastName: "Ohne", status: "active", areas: [] });
    const detail = await getEvent(dispo, ev.id);
    await assignShift(dispo, detail.positions[0]!.shifts.find((s) => s.status === "open")!.id, { employeeId: ben.id, mode: "direct" });
    const acc = asRole(f, "accounting");
    const r = await importTimeRecords(acc, { filename: "ok.csv", data: Buffer.from("employee_number;date;start;end\nP-100;10.07.2026;13:58;22:03\n") });
    expect(r.reconciliation.matched).toBe(1);
    expect(r.reconciliation.missing).toBe(1);
    const approved = await listReconciliation(acc, { status: "approved" });
    expect(approved.total).toBe(1);
    const missing = await listReconciliation(acc, { status: "open", kind: "missing_record" });
    expect(missing.total).toBe(1);
    expect(missing.items[0]!.it.employeeId).toBe(ben.id);
    void cust;
  });

  it("Korrektur protokolliert alt/neu/wer/Begründung; Bestätigung übernimmt korrigierte Zeit; Rollen werden geprüft", async () => {
    const { f } = await setup();
    const acc = asRole(f, "accounting");
    const lead = asRole(f, "operations_lead");
    const dispo = asRole(f, "dispatcher");
    await importTimeRecords(acc, { filename: "a.csv", data: Buffer.from("employee_number;date;start;end\nP-100;10.07.2026;14:00;23:00\n") });
    const item = (await listReconciliation(acc, { status: "open" })).items[0]!.it;
    // Disponent darf nicht korrigieren/bestätigen
    await expect(approveItem(dispo, item.id)).rejects.toThrow(/Berechtigung/);
    await expect(correctItem(dispo, item.id, { approvedStart: d("2026-07-10T12:00:00Z"), approvedEnd: d("2026-07-10T20:30:00Z"), approvedBreakMinutes: 0, reason: "x" })).rejects.toThrow(/Berechtigung/);
    // Einsatzleiter darf korrigieren, nicht bestätigen
    await expect(correctItem(lead, item.id, { approvedStart: d("2026-07-10T12:00:00Z"), approvedEnd: d("2026-07-10T20:30:00Z"), approvedBreakMinutes: 0, reason: "zu" })).rejects.toThrow();
    const corrected = await correctItem(lead, item.id, { approvedStart: d("2026-07-10T12:00:00Z"), approvedEnd: d("2026-07-10T20:30:00Z"), approvedBreakMinutes: 0, reason: "Laut Einsatzleitung bis 22:30 anwesend" });
    expect(corrected.status).toBe("corrected");
    expect(corrected.deviationMinutes).toBe(30);
    await expect(approveItem(lead, item.id)).rejects.toThrow(/Berechtigung/);
    const detail = await getReconciliationItem(acc, item.id);
    expect(detail.corrections.length).toBeGreaterThanOrEqual(1);
    const c = detail.corrections.find((x) => x.c.field === "approvedEnd")!;
    expect(c.c.oldValue).toBe("2026-07-10T21:00:00.000Z");
    expect(c.c.newValue).toBe("2026-07-10T20:30:00.000Z");
    expect(c.c.userId).toBe(f.userId);
    expect(c.c.reason).toContain("Einsatzleitung");
    const approved = await approveItem(acc, item.id, "geprüft");
    expect(approved.status).toBe("approved");
    expect(approved.approvedEnd?.toISOString()).toBe("2026-07-10T20:30:00.000Z");
    await expect(correctItem(acc, item.id, { approvedStart: d("2026-07-10T12:00:00Z"), approvedEnd: d("2026-07-10T21:00:00Z"), approvedBreakMinutes: 0, reason: "nochmal" })).rejects.toThrow(/Bestätigte/);
    const csv = await exportReconciliationCsv(acc, { status: "all" });
    expect(csv).toContain("Bestätigt");
    expect(csv).toContain("Anna");
  });

  it("manueller Nachweis und Ablehnung", async () => {
    const { f, anna, slot } = await setup();
    const acc = asRole(f, "accounting");
    const r = await createManualRecord(acc, { employeeId: anna.id, startedAt: d("2026-07-10T12:00:00Z"), endedAt: d("2026-07-10T20:00:00Z"), note: "telefonisch gemeldet" });
    expect(r.reconciliation.matched).toBe(1);
    await expect(createManualRecord(acc, { employeeId: anna.id, startedAt: d("2026-07-10T12:00:00Z"), endedAt: d("2026-07-10T20:00:00Z") })).rejects.toThrow(/existiert bereits/);
    const s = await withTenant(f.tenantId, (tx) => tx.select().from(shifts).where(eq(shifts.id, slot.id)));
    expect(s[0]?.employeeId).toBe(anna.id);
    const unplanned = await createManualRecord(acc, { employeeId: anna.id, startedAt: d("2026-07-12T08:00:00Z"), endedAt: d("2026-07-12T10:00:00Z") });
    expect(unplanned.reconciliation.unplanned).toBe(1);
    const open = await listReconciliation(acc, { status: "open", kind: "unplanned_record" });
    const rej = await rejectItem(acc, open.items[0]!.it.id, "kein Einsatz bekannt");
    expect(rej.status).toBe("rejected");
  });
});
