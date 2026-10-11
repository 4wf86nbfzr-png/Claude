import { describe, it, expect, afterAll } from "vitest";
import { closeDb, withTenant } from "../../src/server/db/client";
import { makeTenant, asRole } from "../helpers";
import { createEmployee, setEmployeeQualification, setEmployeeStatus, importEmployeesCsv, exportEmployeesCsv, listEmployees } from "../../src/server/modules/employees/service";
import { createQualification } from "../../src/server/modules/qualifications/service";
import { createCustomer } from "../../src/server/modules/customers/service";
import { createEvent, createPosition, getEvent, setOrderStatus, ensureOrder, setEventStatus, updatePosition, updateEvent } from "../../src/server/modules/events/service";
import { assignShift, respondToShift, confirmShift, withdrawShift, previewConflicts, listShifts, updateShiftTimes, expireUnansweredRequests } from "../../src/server/modules/shifts/service";
import { createRequest, convertRequest, setRequestStatus } from "../../src/server/modules/requests/service";
import { loadDashboard } from "../../src/server/modules/dashboard/service";
import { availabilities, shifts, notifications } from "../../src/server/db/schema";
import { eq, and } from "drizzle-orm";
import { systemContext } from "../../src/server/auth/context";

afterAll(() => closeDb());

const d = (iso: string) => new Date(iso);

async function setup() {
  const f = await makeTenant("tenant_admin");
  const dispo = asRole(f, "dispatcher");
  const sec = await createQualification(f.ctx, { key: "34a", name: "Sachkunde §34a", expires: true });
  const anna = await createEmployee(f.ctx, { firstName: "Anna", lastName: "Test", status: "active", areas: ["security"] });
  const ben = await createEmployee(f.ctx, { firstName: "Ben", lastName: "Probe", status: "active", areas: ["security"] });
  await setEmployeeQualification(f.ctx, anna.id, { qualificationId: sec.id, validUntil: "2030-12-31" });
  const cust = await createCustomer(f.ctx, { name: "Hafen Events GmbH", status: "active" });
  const ev = await createEvent(dispo, { customerId: cust.id, name: "Hafenfest", startsAt: d("2027-06-10T16:00:00Z"), endsAt: d("2027-06-11T00:00:00Z") });
  const pos = await createPosition(dispo, ev.id, { name: "Einlass", headcountRequired: 2, startsAt: d("2027-06-10T16:00:00Z"), endsAt: d("2027-06-11T00:00:00Z"), breakMinutes: 0, requiredQualificationIds: [sec.id] });
  return { f, dispo, sec, anna, ben, cust, ev, pos };
}

describe("Szenarien 1–5: Mitarbeiter, Veranstaltung, Position, Zuweisung, Doppelbuchung", () => {
  it("Admin legt Mitarbeiter an, Nummern werden vergeben, Export/Import funktionieren", async () => {
    const { f } = await setup();
    const page = await listEmployees(f.ctx, {});
    expect(page.total).toBe(2);
    expect(page.items.map((e) => e.employeeNumber).sort()).toEqual(["MA-000001", "MA-000002"]);
    const csv = await exportEmployeesCsv(f.ctx);
    expect(csv).toContain("employee_number;first_name");
    const imp = await importEmployeesCsv(f.ctx, "employee_number;first_name;last_name;qualifications\nMA-000001;Anna;Testmann;34a\n;Clara;Neu;34a\nX;;Fehlt;\n");
    expect(imp.updated).toBe(1);
    expect(imp.created).toBe(1);
    expect(imp.errors).toHaveLength(1);
    const after = await listEmployees(f.ctx, { q: "Testmann" });
    expect(after.items[0]?.lastName).toBe("Testmann");
  });

  it("Position erzeugt offene Slots; Zuweisung, Zusage, Bestätigung durchlaufen", async () => {
    const { f, dispo, anna, ev, pos } = await setup();
    const detail = await getEvent(dispo, ev.id);
    const slot = detail.positions[0]!.shifts;
    expect(slot).toHaveLength(2);
    expect(slot.every((s) => s.status === "open")).toBe(true);
    const r = await assignShift(dispo, slot[0]!.id, { employeeId: anna.id, mode: "request" });
    expect(r.shift.status).toBe("requested");
    expect(r.shift.responseDeadlineAt).not.toBeNull();
    // Mitarbeiterportal-Kontext
    const empCtx = asRole(f, "employee", { employeeId: anna.id });
    const acc = await respondToShift(empCtx, slot[0]!.id, { response: "accepted" });
    expect(acc.status).toBe("accepted");
    const conf = await confirmShift(dispo, slot[0]!.id);
    expect(conf.status).toBe("confirmed");
    void pos;
    const after = await getEvent(dispo, ev.id);
    expect(after.positions[0]!.filled).toBe(1);
    expect(after.positions[0]!.open).toBe(1);
  });

  it("Doppelbuchung wird erkannt und ist nicht freigebbar", async () => {
    const { f, dispo, anna, cust, sec } = await setup();
    const ev1 = await createEvent(dispo, { customerId: cust.id, name: "Event A", startsAt: d("2027-07-01T10:00:00Z"), endsAt: d("2027-07-01T18:00:00Z") });
    const p1 = await createPosition(dispo, ev1.id, { name: "Posten", headcountRequired: 1, startsAt: d("2027-07-01T10:00:00Z"), endsAt: d("2027-07-01T18:00:00Z"), breakMinutes: 0, requiredQualificationIds: [] });
    const ev2 = await createEvent(dispo, { customerId: cust.id, name: "Event B", startsAt: d("2027-07-01T15:00:00Z"), endsAt: d("2027-07-01T22:00:00Z") });
    const p2 = await createPosition(dispo, ev2.id, { name: "Posten", headcountRequired: 1, startsAt: d("2027-07-01T15:00:00Z"), endsAt: d("2027-07-01T22:00:00Z"), breakMinutes: 0, requiredQualificationIds: [] });
    const s1 = (await listShifts(dispo, { positionId: p1.id })).items[0]!;
    const s2 = (await listShifts(dispo, { positionId: p2.id })).items[0]!;
    await assignShift(dispo, s1.id, { employeeId: anna.id, mode: "direct" });
    const conflicts = await previewConflicts(dispo, s2.id, anna.id);
    expect(conflicts.some((c) => c.type === "double_booking" && c.hard)).toBe(true);
    await expect(assignShift(dispo, s2.id, { employeeId: anna.id, mode: "direct", overrideReason: "egal" })).rejects.toThrow(/Bereits eingeplant/);
    void f;
    void sec;
  });

  it("fehlende Qualifikation blockiert ohne Freigabe, mit Begründung + Recht wird sie protokolliert", async () => {
    const { f, dispo, ben, ev } = await setup();
    const detail = await getEvent(dispo, ev.id);
    const slot = detail.positions[0]!.shifts[0]!;
    await expect(assignShift(dispo, slot.id, { employeeId: ben.id, mode: "request" })).rejects.toThrow(/Qualifikation fehlt/);
    const lead = asRole(f, "operations_lead"); // hat shifts:assign, aber kein override
    await expect(assignShift(lead, slot.id, { employeeId: ben.id, mode: "request", overrideReason: "Begleitet durch Objektleiter" })).rejects.toThrow(/shifts:override_conflict/);
    const r = await assignShift(dispo, slot.id, { employeeId: ben.id, mode: "request", overrideReason: "Begleitet durch Objektleiter" });
    expect(r.conflicts.map((c) => c.type)).toContain("missing_qualification");
    expect(r.shift.conflictOverrideReason).toBe("Begleitet durch Objektleiter");
    expect(r.shift.conflictOverrideBy).toBe(f.userId);
  });

  it("Nichtverfügbarkeit, Ruhezeit und Schichtdauer werden als weiche Konflikte gemeldet", async () => {
    const { f, dispo, anna, cust } = await setup();
    await withTenant(f.tenantId, (tx) => tx.insert(availabilities).values({ tenantId: f.tenantId, employeeId: anna.id, kind: "unavailable", startsAt: d("2027-08-01T00:00:00Z"), endsAt: d("2027-08-03T00:00:00Z"), note: "Urlaub" }));
    const ev = await createEvent(dispo, { customerId: cust.id, name: "Lang", startsAt: d("2027-08-02T08:00:00Z"), endsAt: d("2027-08-02T22:00:00Z") });
    const p = await createPosition(dispo, ev.id, { name: "Posten", headcountRequired: 1, startsAt: d("2027-08-02T08:00:00Z"), endsAt: d("2027-08-02T22:00:00Z"), breakMinutes: 0, requiredQualificationIds: [] });
    const s = (await listShifts(dispo, { positionId: p.id })).items[0]!;
    const c = await previewConflicts(dispo, s.id, anna.id);
    expect(c.map((x) => x.type)).toEqual(expect.arrayContaining(["unavailable", "max_duration"]));
    // Ruhezeit: Folgeschicht 4 h nach Ende
    const ev2 = await createEvent(dispo, { customerId: cust.id, name: "Früh", startsAt: d("2027-08-03T02:00:00Z"), endsAt: d("2027-08-03T06:00:00Z") });
    const p2 = await createPosition(dispo, ev2.id, { name: "Posten", headcountRequired: 1, startsAt: d("2027-08-03T02:00:00Z"), endsAt: d("2027-08-03T06:00:00Z"), breakMinutes: 0, requiredQualificationIds: [] });
    const s2 = (await listShifts(dispo, { positionId: p2.id })).items[0]!;
    await assignShift(dispo, s.id, { employeeId: anna.id, mode: "direct", overrideReason: "abgesprochen" });
    const c2 = await previewConflicts(dispo, s2.id, anna.id);
    expect(c2.map((x) => x.type)).toContain("rest_time");
  });

  it("Absage öffnet den Slot neu und meldet die Disposition; Rückzug ebenso", async () => {
    const { f, dispo, anna, ben, ev } = await setup();
    const detail = await getEvent(dispo, ev.id);
    const [a, b] = detail.positions[0]!.shifts;
    await assignShift(dispo, a!.id, { employeeId: anna.id, mode: "request" });
    const empCtx = asRole(f, "employee", { employeeId: anna.id });
    await respondToShift(empCtx, a!.id, { response: "declined", note: "krank" });
    const after = await getEvent(dispo, ev.id);
    const list = after.positions[0]!.shifts;
    expect(list.filter((s) => s.status === "open")).toHaveLength(2);
    expect(list.find((s) => s.id === a!.id)?.status).toBe("declined");
    expect(list.find((s) => s.id === a!.id)?.replacedByShiftId).toBeTruthy();
    const notes = await withTenant(f.tenantId, (tx) => tx.select().from(notifications).where(and(eq(notifications.userId, f.userId), eq(notifications.kind, "shift.declined"))));
    expect(notes.length).toBeGreaterThan(0);
    // Rückzug einer bestätigten Zuweisung
    await assignShift(dispo, b!.id, { employeeId: ben.id, mode: "direct", overrideReason: "Freigabe Qualifikation" });
    await withdrawShift(dispo, b!.id, "Kunde reduziert Bedarf");
    const dash = await loadDashboard(f.ctx, d("2027-06-01T00:00:00Z"));
    expect(dash.unhandledDeclines).toBe(2);
    expect(dash.openPositions).toBe(2);
  });

  it("Fristablauf setzt auf „keine Rückmeldung“ und öffnet den Slot", async () => {
    const { f, dispo, anna, ev } = await setup();
    const detail = await getEvent(dispo, ev.id);
    const a = detail.positions[0]!.shifts[0]!;
    await assignShift(dispo, a.id, { employeeId: anna.id, mode: "request" });
    await withTenant(f.tenantId, (tx) => tx.update(shifts).set({ responseDeadlineAt: d("2020-01-01T00:00:00Z") }).where(eq(shifts.id, a.id)));
    const n = await expireUnansweredRequests(systemContext(f.tenantId));
    expect(n).toBe(1);
    const after = await getEvent(dispo, ev.id);
    expect(after.positions[0]!.shifts.find((s) => s.id === a.id)?.status).toBe("no_response");
  });

  it("Bedarfsänderung und Zeitverschiebung wirken auf Slots; Auftrag/Veranstaltung werden verbindlich", async () => {
    const { f, dispo, anna, ev, pos } = await setup();
    await updatePosition(dispo, pos.id, { headcountRequired: 3 });
    let detail = await getEvent(dispo, ev.id);
    expect(detail.positions[0]!.shifts).toHaveLength(3);
    await updatePosition(dispo, pos.id, { headcountRequired: 1 });
    detail = await getEvent(dispo, ev.id);
    expect(detail.positions[0]!.shifts).toHaveLength(1);
    const slot = detail.positions[0]!.shifts[0]!;
    await assignShift(dispo, slot.id, { employeeId: anna.id, mode: "direct" });
    await expect(updatePosition(dispo, pos.id, { headcountRequired: 0 as never })).rejects.toThrow();
    const moved = await updateShiftTimes(dispo, slot.id, { startsAt: d("2027-06-10T17:00:00Z"), endsAt: d("2027-06-11T01:00:00Z") });
    expect(moved.shift.startsAt.toISOString()).toBe("2027-06-10T17:00:00.000Z");
    // Auftrag bestätigen -> Veranstaltung bestätigt
    const order = await ensureOrder(dispo, ev.id);
    await setEventStatus(dispo, ev.id, "planned");
    await expect(setEventStatus(dispo, ev.id, "confirmed")).rejects.toThrow(/Auftrag/);
    await setOrderStatus(dispo, order.id, "confirmed");
    detail = await getEvent(dispo, ev.id);
    expect(detail.event.status).toBe("confirmed");
    // Änderung nach Bestätigung braucht Begründung und wird historisiert
    await expect(updateEvent(dispo, ev.id, { name: "Hafenfest 2027" })).rejects.toThrow(/Begründung/);
    await updateEvent(dispo, ev.id, { name: "Hafenfest 2027" }, "Kunde wünscht Umbenennung");
    detail = await getEvent(dispo, ev.id);
    expect(detail.changes[0]?.field).toBe("name");
    expect(detail.order?.status).toBe("changed");
    void f;
  });

  it("Deaktivieren mit künftigen Einsätzen wird abgelehnt, sonst mit Aufbewahrungsfrist", async () => {
    const { f, dispo, anna, ben, ev } = await setup();
    const detail = await getEvent(dispo, ev.id);
    await assignShift(dispo, detail.positions[0]!.shifts[0]!.id, { employeeId: anna.id, mode: "direct" });
    await expect(setEmployeeStatus(f.ctx, anna.id, "inactive")).rejects.toThrow(/künftige Einsätze/);
    const r = await setEmployeeStatus(f.ctx, ben.id, "inactive", "Vertrag beendet");
    expect(r.retainUntil).toBeTruthy();
  });
});

describe("Szenarien 6–7: Kundenanfragen und Duplikate", () => {
  it("legt Anfrage an, markiert fehlende Felder, erkennt Duplikat und wandelt um", async () => {
    const { f, dispo, cust } = await setup();
    const r1 = await createRequest(dispo, { title: "Firmenfeier", contactEmail: "kontakt@kunde.invalid", startsAt: d("2027-09-01T18:00:00Z"), endsAt: d("2027-09-02T01:00:00Z"), locationText: "Hamburg", headcount: 4, source: "api" });
    expect(r1.duplicate).toBe(false);
    expect(r1.request.missingFields).toEqual(["customerId"]);
    const r2 = await createRequest(dispo, { title: "Firmenfeier", contactEmail: "kontakt@kunde.invalid", startsAt: d("2027-09-01T18:00:00Z"), endsAt: d("2027-09-02T01:00:00Z"), locationText: "Hamburg", headcount: 4, source: "api" });
    expect(r2.duplicate).toBe(true);
    expect(r2.request.status).toBe("duplicate");
    expect(r2.request.duplicateOfId).toBe(r1.request.id);
    // externalRef: zweiter Aufruf liefert bestehenden Datensatz
    const e1 = await createRequest(dispo, { title: "Messe", externalRef: "web-123", source: "api" });
    const e2 = await createRequest(dispo, { title: "Messe geändert", externalRef: "web-123", source: "api" });
    expect(e2.existing).toBe(true);
    expect(e2.request.id).toBe(e1.request.id);
    // Umwandlung scheitert ohne Kunde, gelingt mit Kunde
    await expect(convertRequest(dispo, r1.request.id)).rejects.toThrow(/Kunde/);
    await setRequestStatus(dispo, r1.request.id, "accepted");
    const conv = await convertRequest(dispo, r1.request.id, { customerId: cust.id });
    expect(conv.event.status).toBe("planned");
    expect(conv.order.status).toBe("draft");
    const detail = await getEvent(dispo, conv.event.id);
    expect(detail.positions[0]!.headcountRequired).toBe(4);
    expect(detail.positions[0]!.shifts).toHaveLength(4);
    void f;
  });
});
