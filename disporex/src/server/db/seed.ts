import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { withSystem, closeDb } from "./client";
import { tenants, users, memberships, type RoleKey } from "./schema";
import { hashPassword } from "../core/crypto";
import { resolvePermissions } from "../auth/permissions";
import type { AuthContext } from "../auth/context";
import { createQualification } from "../modules/qualifications/service";
import { createEmployee, setEmployeeQualification } from "../modules/employees/service";
import { createCustomer, upsertContact, upsertLocation } from "../modules/customers/service";
import { createEvent, createPosition, getEvent, setEventStatus, ensureOrder, setOrderStatus } from "../modules/events/service";
import { assignShift, respondToShift } from "../modules/shifts/service";
import { createAvailability } from "../modules/availability/service";
import { createPartner, upsertPartnerContact, createOffer } from "../modules/partners/service";
import { createRequest } from "../modules/requests/service";
import { createRateCard, createSurchargeRule } from "../modules/billing/service";
import { createDefaultRules } from "../modules/automations/service";
import { importTimeRecords } from "../modules/time/service";

/**
 * Demodaten für Entwicklung und Vorführung. Ausschließlich synthetische Daten:
 * erfundene Namen, reservierte Domain `.example`, keine echten Personen oder Firmen.
 *
 *   pnpm db:seed                      # legt Mandant „Demo Personaldienst (synthetisch)“ an
 *   SEED_PASSWORD=... pnpm db:seed    # festes Passwort für alle Demo-Konten
 *
 * Schutz: läuft nicht in Produktion; bricht ab, wenn der Demo-Mandant bereits existiert
 * (nichts wird überschrieben oder gelöscht – zum Neuaufbau `pnpm db:reset`).
 */

const DEMO_SLUG = "demo-synthetisch";
const DEMO_DOMAIN = "disporex.example";

type Account = { email: string; role: RoleKey; name: string };
const ACCOUNTS: Account[] = [
  { email: `admin@${DEMO_DOMAIN}`, role: "tenant_admin", name: "Demo Administration" },
  { email: `dispo@${DEMO_DOMAIN}`, role: "dispatcher", name: "Demo Disposition" },
  { email: `einsatzleitung@${DEMO_DOMAIN}`, role: "operations_lead", name: "Demo Einsatzleitung" },
  { email: `personal@${DEMO_DOMAIN}`, role: "hr", name: "Demo Personalabteilung" },
  { email: `buchhaltung@${DEMO_DOMAIN}`, role: "accounting", name: "Demo Buchhaltung" },
];

/** Erfundene Namen; bewusst keine real existierenden Personen. */
const EMPLOYEES = [
  ["Alex", "Beispiel", "security", "festanstellung"],
  ["Kim", "Muster", "security", "teilzeit"],
  ["Sam", "Platzhalter", "ordnung", "minijob"],
  ["Robin", "Probe", "gastro", "kurzfristig"],
  ["Chris", "Vorlage", "gastro", "werkstudent"],
  ["Toni", "Testfall", "promotion", "minijob"],
  ["Nico", "Demo", "logistik", "festanstellung"],
  ["Jo", "Schablone", "logistik", "teilzeit"],
  ["Luca", "Entwurf", "fahrservice", "freiberuflich"],
  ["Mika", "Fiktiv", "reinigung", "minijob"],
  ["Charlie", "Synthetik", "security", "festanstellung"],
  ["Dana", "Attrappe", "ordnung", "kurzfristig"],
] as const;

function ctxFor(tenantId: string, userId: string, role: RoleKey, name: string): AuthContext {
  return {
    kind: "session",
    tenantId,
    userId,
    userName: name,
    role,
    permissions: resolvePermissions(role),
    isSystemAdmin: false,
    employeeId: null,
    customerId: null,
    partnerId: null,
    requestId: "seed",
  };
}

function at(daysFromNow: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  // Europe/Berlin ist je nach Jahreszeit UTC+1/+2; für Demodaten reicht eine feste Verschiebung von +2.
  d.setUTCHours(hour - 2, minute, 0, 0);
  return d;
}
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");

export async function seedDemo(opts: { password?: string; log?: (line: string) => void } = {}): Promise<{ tenantId: string; password: string }> {
  if (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("db:seed ist in Produktion gesperrt.");
  }
  const log = opts.log ?? (() => undefined);
  const password = opts.password ?? `Demo-${randomBytes(9).toString("base64url")}`;

  // 1) Mandant und Konten -------------------------------------------------------------
  const base = await withSystem(async (tx) => {
    const exists = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, DEMO_SLUG)).limit(1);
    if (exists[0]) throw new Error(`Demo-Mandant „${DEMO_SLUG}“ existiert bereits – nichts geändert. Zum Neuaufbau: CONFIRM_RESET=yes pnpm db:reset && pnpm db:seed`);
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: "Demo Personaldienst (synthetisch)",
        slug: DEMO_SLUG,
        settings: { timezone: "Europe/Berlin", responseDeadlineHours: 24, minRestHours: 11, maxShiftHours: 12, reconciliationToleranceMinutes: 5, retentionDaysInactiveEmployees: 180, retentionDaysAuditLogs: 365 },
      })
      .returning();
    const passwordHash = await hashPassword(password);
    const created: Record<RoleKey, { userId: string; name: string }> = {} as never;
    for (const a of ACCOUNTS) {
      const [u] = await tx.insert(users).values({ email: a.email, name: a.name, passwordHash, status: "active" }).returning();
      await tx.insert(memberships).values({ tenantId: tenant!.id, userId: u!.id, role: a.role });
      created[a.role] = { userId: u!.id, name: a.name };
    }
    return { tenantId: tenant!.id, created };
  });
  const T = base.tenantId;
  const admin = ctxFor(T, base.created.tenant_admin.userId, "tenant_admin", base.created.tenant_admin.name);
  const dispo = ctxFor(T, base.created.dispatcher.userId, "dispatcher", base.created.dispatcher.name);
  const hr = ctxFor(T, base.created.hr.userId, "hr", base.created.hr.name);
  const acc = ctxFor(T, base.created.accounting.userId, "accounting", base.created.accounting.name);
  log(`Mandant angelegt: ${T}`);

  // 2) Qualifikationen -----------------------------------------------------------------
  const q34a = await createQualification(admin, { key: "sachkunde-34a", name: "Sachkunde §34a GewO", expires: false });
  const qErste = await createQualification(admin, { key: "ersthelfer", name: "Ersthelfer/in", expires: true, description: "Auffrischung alle 2 Jahre" });
  const qStapler = await createQualification(admin, { key: "stapler", name: "Staplerschein", expires: true });
  const qHygiene = await createQualification(admin, { key: "hygiene", name: "Hygienebelehrung", expires: true });
  const qFuehrer = await createQualification(admin, { key: "fahrerlaubnis-b", name: "Fahrerlaubnis Klasse B", expires: false });

  // 3) Mitarbeiter (synthetisch) --------------------------------------------------------
  const emp: { id: string; employeeNumber: string; area: string }[] = [];
  for (const [i, [first, last, area, type]] of EMPLOYEES.entries()) {
    const e = await createEmployee(hr, {
      firstName: first,
      lastName: last,
      email: `${first}.${last}@mitarbeiter.${DEMO_DOMAIN}`.toLowerCase(),
      phone: `+49 40 000000${pad(i + 1)}`,
      city: ["Hamburg", "Norderstedt", "Pinneberg", "Ahrensburg"][i % 4],
      status: "active",
      employmentType: type,
      areas: [area],
      notes: "Synthetischer Demodatensatz – keine reale Person.",
    });
    emp.push({ id: e.id, employeeNumber: e.employeeNumber, area });
  }
  const byArea = (a: string) => emp.filter((e) => e.area === a);
  for (const e of byArea("security").concat(byArea("ordnung"))) await setEmployeeQualification(hr, e.id, { qualificationId: q34a.id });
  // Ersthelfer: einer gültig, einer läuft in 20 Tagen ab (Warnung im Dashboard/Bericht)
  await setEmployeeQualification(hr, emp[0]!.id, { qualificationId: qErste.id, validUntil: isoDay(at(400, 12)) });
  await setEmployeeQualification(hr, emp[1]!.id, { qualificationId: qErste.id, validUntil: isoDay(at(20, 12)) });
  for (const e of byArea("logistik")) await setEmployeeQualification(hr, e.id, { qualificationId: qStapler.id, validUntil: isoDay(at(700, 12)) });
  for (const e of byArea("gastro")) await setEmployeeQualification(hr, e.id, { qualificationId: qHygiene.id, validUntil: isoDay(at(300, 12)) });
  for (const e of byArea("fahrservice")) await setEmployeeQualification(hr, e.id, { qualificationId: qFuehrer.id });
  // Abwesenheit, die bei der Besetzung als Konflikt erscheint
  await createAvailability(dispo, { employeeId: emp[10]!.id, kind: "unavailable", startsAt: at(2, 0), endsAt: at(9, 0), note: "Urlaub (Demo)" });
  log(`${emp.length} Mitarbeiter angelegt`);

  // 4) Kunden, Ansprechpartner, Standorte ---------------------------------------------------
  const kHafen = await createCustomer(dispo, { name: "Hafenkultur Veranstaltungs-GmbH (Demo)", email: `events@hafenkultur.${DEMO_DOMAIN}`, phone: "+49 40 0000100", status: "active", billingAddress: { street: "Kaistraße 1", zip: "20457", city: "Hamburg", country: "DE" }, paymentTermsDays: "14", requirements: "Dresscode Schwarz, Sachkunde §34a für alle Einlasskräfte." });
  const kMesse = await createCustomer(dispo, { name: "Nordmesse Beispiel AG (Demo)", email: `einkauf@nordmesse.${DEMO_DOMAIN}`, status: "active", billingAddress: { street: "Messeplatz 2", zip: "20357", city: "Hamburg", country: "DE" }, paymentTermsDays: "30" });
  const kLager = await createCustomer(dispo, { name: "Lagerlogistik Musterfirma (Demo)", email: `dispo@lagerlogistik.${DEMO_DOMAIN}`, status: "active", billingAddress: { street: "Industrieweg 9", zip: "21079", city: "Hamburg", country: "DE" } });
  await upsertContact(dispo, kHafen.id, { name: "Pat Ansprech", role: "Eventleitung", email: `p.ansprech@hafenkultur.${DEMO_DOMAIN}`, phone: "+49 40 0000101", isPrimary: true });
  await upsertContact(dispo, kMesse.id, { name: "Sascha Kontakt", role: "Einkauf", email: `s.kontakt@nordmesse.${DEMO_DOMAIN}`, isPrimary: true });
  const locHafen = await upsertLocation(dispo, { customerId: kHafen.id, name: "Kaispeicher Demo", street: "Kaistraße 1", zip: "20457", city: "Hamburg", country: "DE", notes: "Treffpunkt Personaleingang Nord." });
  const locMesse = await upsertLocation(dispo, { customerId: kMesse.id, name: "Halle B4", street: "Messeplatz 2", zip: "20357", city: "Hamburg", country: "DE" });
  const locLager = await upsertLocation(dispo, { customerId: kLager.id, name: "Lager Harburg", street: "Industrieweg 9", zip: "21079", city: "Hamburg", country: "DE" });

  // 5) Stundensätze und Zuschläge ------------------------------------------------------------
  const jan1 = `${new Date().getUTCFullYear()}-01-01`;
  await createRateCard(acc, { label: "Standardsatz", hourlyRateCents: 2900, validFrom: jan1 });
  await createRateCard(acc, { customerId: kHafen.id, billingCategory: "security", label: "Hafenkultur Security", hourlyRateCents: 3450, validFrom: jan1 });
  await createRateCard(acc, { customerId: kMesse.id, billingCategory: "hostess", label: "Nordmesse Hostess/Promotion", hourlyRateCents: 3100, validFrom: jan1 });
  await createRateCard(acc, { customerId: kLager.id, billingCategory: "logistik", label: "Lagerlogistik Helfer", hourlyRateCents: 2650, validFrom: jan1 });
  await createSurchargeRule(acc, { name: "Nachtzuschlag", kind: "night", percent: 25, fromTime: "22:00", toTime: "06:00", holidays: [], validFrom: "2020-01-01" });
  await createSurchargeRule(acc, { name: "Sonntagszuschlag", kind: "sunday", percent: 50, holidays: [], validFrom: "2020-01-01" });
  await createSurchargeRule(acc, { name: "Feiertagszuschlag", kind: "holiday", percent: 100, holidays: [`${new Date().getUTCFullYear()}-10-03`, `${new Date().getUTCFullYear()}-12-25`, `${new Date().getUTCFullYear()}-12-26`], validFrom: "2020-01-01" });

  // 6) Abgeschlossene Veranstaltung (vor 10 Tagen) mit Zeitnachweisen und Abgleich --------------
  const past = await createEvent(dispo, { customerId: kHafen.id, locationId: locHafen.id, name: "Hafenkonzert (Demo, vergangen)", startsAt: at(-10, 18), endsAt: at(-9, 2), dresscode: "Schwarz, Dienstjacke", meetingPoint: "Personaleingang Nord" });
  const pastPos = await createPosition(dispo, past.id, { name: "Einlasskontrolle", headcountRequired: 3, startsAt: at(-10, 18), endsAt: at(-9, 2), breakMinutes: 30, requiredQualificationIds: [q34a.id], billingCategory: "security" });
  await setEventStatus(dispo, past.id, "planned");
  const pastDetail = await getEvent(dispo, past.id);
  const pastSlots = pastDetail.positions.find((p) => p.id === pastPos.id)!.shifts.filter((s) => s.status === "open");
  const pastStaff = byArea("security").slice(0, 3);
  for (const [i, slot] of pastSlots.entries()) await assignShift(dispo, slot.id, { employeeId: pastStaff[i]!.id, mode: "direct", note: "telefonisch zugesagt (Demo)" });
  const pastOrder = await ensureOrder(dispo, past.id);
  await setOrderStatus(dispo, pastOrder.id, "confirmed", { notes: "Auftrag schriftlich bestätigt (Demo)." }); // bestätigt auch die Veranstaltung
  await setEventStatus(dispo, past.id, "completed");
  // Zeitnachweise: einer pünktlich (auto-bestätigt), einer 40 Minuten länger (Abweichung), einer fehlt
  const d0 = at(-10, 18);
  const dd = `${pad(d0.getUTCDate())}.${pad(d0.getUTCMonth() + 1)}.${d0.getUTCFullYear()}`;
  const csv = ["mitarbeiternummer;datum;beginn;ende;pause", `${pastStaff[0]!.employeeNumber};${dd};17:58;02:02;30`, `${pastStaff[1]!.employeeNumber};${dd};18:00;02:40;30`].join("\n") + "\n";
  const imp = await importTimeRecords(acc, { filename: "demo-zeitnachweise.csv", data: Buffer.from(csv) });
  log(`Zeitnachweise importiert: ${imp.reference} (${imp.imported} Zeilen, ${imp.reconciliation.deviations} Abweichung, ${imp.reconciliation.missing} fehlend)`);

  // 7) Laufende Planung ------------------------------------------------------------------------
  const messe = await createEvent(dispo, { customerId: kMesse.id, locationId: locMesse.id, name: "Frühjahrsmesse Stand B4 (Demo)", startsAt: at(3, 9), endsAt: at(5, 18), dresscode: "Business, Namensschild", briefing: "Standbetreuung, Besucherregistrierung, Catering-Unterstützung.", meetingPoint: "Halle B4, Infocounter" });
  const messeHost = await createPosition(dispo, messe.id, { name: "Hostess/Host Registrierung", headcountRequired: 2, startsAt: at(3, 9), endsAt: at(3, 18), breakMinutes: 45, requiredQualificationIds: [], billingCategory: "hostess" });
  await createPosition(dispo, messe.id, { name: "Standsicherheit", headcountRequired: 1, startsAt: at(3, 8), endsAt: at(3, 19), breakMinutes: 60, requiredQualificationIds: [q34a.id], billingCategory: "security" });
  await setEventStatus(dispo, messe.id, "planned");
  const messeDetail = await getEvent(dispo, messe.id);
  const hostSlots = messeDetail.positions.find((p) => p.id === messeHost.id)!.shifts.filter((s) => s.status === "open");
  const promo = byArea("promotion").concat(byArea("gastro"));
  const r1 = await assignShift(dispo, hostSlots[0]!.id, { employeeId: promo[0]!.id, mode: "request" });
  await respondToShift({ ...admin, role: "employee", permissions: resolvePermissions("employee"), employeeId: promo[0]!.id }, r1.shift.id, { response: "accepted" });
  await assignShift(dispo, hostSlots[1]!.id, { employeeId: promo[1]!.id, mode: "request" });
  await ensureOrder(dispo, messe.id);

  const lager = await createEvent(dispo, { customerId: kLager.id, locationId: locLager.id, name: "Inventur Lager Harburg (Demo)", startsAt: at(7, 6), endsAt: at(7, 15), specialNotes: "Sicherheitsschuhe Pflicht." });
  const lagerPos = await createPosition(dispo, lager.id, { name: "Kommissionierung", headcountRequired: 4, startsAt: at(7, 6), endsAt: at(7, 15), breakMinutes: 30, requiredQualificationIds: [qStapler.id], billingCategory: "logistik" });
  await setEventStatus(dispo, lager.id, "planned");
  const lagerDetail = await getEvent(dispo, lager.id);
  const lagerSlots = lagerDetail.positions.find((p) => p.id === lagerPos.id)!.shifts.filter((s) => s.status === "open");
  for (const [i, e] of byArea("logistik").entries()) await assignShift(dispo, lagerSlots[i]!.id, { employeeId: e.id, mode: "direct" });

  const hafen2 = await createEvent(dispo, { customerId: kHafen.id, locationId: locHafen.id, name: "Sommerfest Kaispeicher (Demo)", startsAt: at(14, 16), endsAt: at(15, 1), dresscode: "Schwarz" });
  await createPosition(dispo, hafen2.id, { name: "Einlass", headcountRequired: 4, startsAt: at(14, 16), endsAt: at(15, 1), breakMinutes: 30, requiredQualificationIds: [q34a.id], billingCategory: "security" });
  await createPosition(dispo, hafen2.id, { name: "Garderobe", headcountRequired: 2, startsAt: at(14, 17), endsAt: at(15, 1), breakMinutes: 30, requiredQualificationIds: [] });
  await createPosition(dispo, hafen2.id, { name: "Bar-Unterstützung", headcountRequired: 3, startsAt: at(14, 18), endsAt: at(15, 1), breakMinutes: 30, requiredQualificationIds: [qHygiene.id] });
  const ord = await ensureOrder(dispo, hafen2.id);
  await setOrderStatus(dispo, ord.id, "offered", { notes: "Angebot per E-Mail versendet (Demo)." });
  log("3 kommende Veranstaltungen angelegt");

  // 8) Partner und Positionsangebot -------------------------------------------------------------
  const partner = await createPartner(dispo, { name: "Nordlicht Sicherheitsdienst (Demo-Partner)", email: `dispo@nordlicht.${DEMO_DOMAIN}`, phone: "+49 40 0000200", city: "Hamburg", qualificationIds: [q34a.id], complianceNotes: "Bewachungserlaubnis vorgelegt (Demo).", status: "active" });
  await upsertPartnerContact(dispo, partner.id, { name: "Rene Partnerkontakt", role: "Disposition", email: `r.partner@nordlicht.${DEMO_DOMAIN}`, isPrimary: true });
  const hafen2Detail = await getEvent(dispo, hafen2.id);
  const einlass = hafen2Detail.positions.find((p) => p.name === "Einlass")!;
  await createOffer(dispo, { partnerId: partner.id, positionId: einlass.id, headcountRequested: 2, message: "Bitte 2 Kräfte mit §34a für den Einlass.", shareBriefing: true, deadlineAt: at(10, 12) });

  // 9) Kundenanfragen und Automatisierungsregeln ----------------------------------------------------
  await createDefaultRules(admin);
  await createRequest(dispo, { customerId: kMesse.id, title: "Herbstmesse: 6 Hostessen für 3 Tage", description: "Wie im Frühjahr, diesmal zwei Stände.", contactName: "Sascha Kontakt", contactEmail: `s.kontakt@nordmesse.${DEMO_DOMAIN}`, locationText: "Messeplatz 2, Halle B4/B5", startsAt: at(45, 9), endsAt: at(47, 18), headcount: 6, source: "manual" });
  await createRequest(dispo, { title: "Firmenjubiläum – Sicherheitsdienst gesucht", description: "Guten Tag, wir planen ein Jubiläum mit ca. 300 Gästen und bräuchten Einlass- und Parkplatzpersonal. Termin steht noch nicht fest.", contactName: "Interessent Beispiel", contactEmail: `kontakt@neukunde.${DEMO_DOMAIN}`, source: "email" });
  log("Anfragen und Automatisierungsregeln angelegt");

  return { tenantId: T, password };
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  seedDemo({ password: process.env.SEED_PASSWORD, log: (l) => console.log(`  ${l}`) })
    .then(async ({ password }) => {
      console.log("\nDemodaten eingespielt. Anmeldung (alle Konten gleiches Passwort):");
      for (const a of ACCOUNTS) console.log(`  ${a.email.padEnd(40)} ${a.role}`);
      console.log(`  Passwort: ${password}`);
      console.log("\nHinweis: Alle Daten sind synthetisch. Mandant: „Demo Personaldienst (synthetisch)“.");
      await closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Seed fehlgeschlagen:", err instanceof Error ? err.message : err);
      await closeDb().catch(() => undefined);
      process.exit(1);
    });
}
