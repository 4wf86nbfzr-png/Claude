import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { employeeInput, employeeListQuery } from "../modules/employees/schema";
import { customerInput, customerListQuery } from "../modules/customers/schema";
import { requestInput, requestListQuery } from "../modules/requests/schema";
import { eventInputBase, positionInputBase, eventListQuery } from "../modules/events/schema";
import { shiftListQuery, assignInput, respondInput, shiftTimesInput } from "../modules/shifts/schema";
import { availabilityInput } from "../modules/availability/service";
import { offerInput, offerResponseInput } from "../modules/partners/schema";
import { reconListQuery, correctionInput, timeRecordListQuery } from "../modules/time/service";
import { endpointInput } from "../modules/webhooks/service";
import { inboundEmailInput } from "../modules/email/inbound";
import { DOMAIN_EVENT_TYPES } from "../core/events";
import { PERMISSIONS } from "../auth/permissions";

extendZodWithOpenApi(z);

/**
 * OpenAPI 3.1 aus den zod-Schemas der Services. Die Endpunkte sind hier registriert;
 * Request-/Response-Schemata entsprechen den tatsächlich in den Route-Handlern
 * verwendeten Validierungen.
 */
export function buildOpenApi(baseUrl = "http://localhost:3000") {
  const r = new OpenAPIRegistry();
  r.registerComponent("securitySchemes", "ApiKey", { type: "http", scheme: "bearer", description: "API-Schlüssel (drx_…) aus Einstellungen → API-Schlüssel. Scopes entsprechen Berechtigungen." });
  r.registerComponent("securitySchemes", "Session", { type: "apiKey", in: "cookie", name: "drx_session" });

  const err = r.register("Error", z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }), requestId: z.string() }));
  const errors = {
    400: { description: "Validierungsfehler", content: { "application/json": { schema: err } } },
    401: { description: "Nicht authentifiziert", content: { "application/json": { schema: err } } },
    403: { description: "Keine Berechtigung / Scope fehlt", content: { "application/json": { schema: err } } },
    404: { description: "Nicht gefunden (auch bei fremdem Mandanten)", content: { "application/json": { schema: err } } },
    409: { description: "Konflikt (z. B. Doppelbuchung, Statusübergang)", content: { "application/json": { schema: err } } },
    429: { description: "Rate-Limit", content: { "application/json": { schema: err } } },
  };
  const page = (item: z.ZodTypeAny) => z.object({ items: z.array(item), page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() });
  const uuid = z.string().uuid();
  const idParam = z.object({ id: uuid });
  const sec: Record<string, string[]>[] = [{ ApiKey: [] }, { Session: [] }];
  const idem = z.object({ "Idempotency-Key": z.string().optional().openapi({ description: "Gleiche Antwort für 24 h bei gleichem Body" }) });

  const employee = r.register("Employee", employeeInput.extend({ id: uuid, employeeNumber: z.string(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() }));
  const customer = r.register("Customer", customerInput.extend({ id: uuid, customerNumber: z.string(), createdAt: z.string().datetime() }));
  const request = r.register("CustomerRequest", requestInput.extend({ id: uuid, status: z.enum(["new", "in_review", "needs_info", "quoted", "accepted", "declined", "converted", "duplicate"]), missingFields: z.array(z.string()), duplicateOfId: uuid.nullable(), convertedEventId: uuid.nullable(), createdAt: z.string().datetime() }));
  const event = r.register("Event", eventInputBase.extend({ id: uuid, status: z.enum(["draft", "planned", "confirmed", "in_progress", "completed", "cancelled"]), createdAt: z.string().datetime() }));
  const position = r.register("Position", positionInputBase.extend({ id: uuid, eventId: uuid }));
  const shift = r.register("Shift", z.object({ id: uuid, eventId: uuid, positionId: uuid, employeeId: uuid.nullable(), partnerId: uuid.nullable(), status: z.enum(["open", "requested", "accepted", "declined", "no_response", "confirmed", "withdrawn", "replaced", "cancelled"]), startsAt: z.string().datetime(), endsAt: z.string().datetime(), breakMinutes: z.number(), requestedAt: z.string().datetime().nullable(), responseDeadlineAt: z.string().datetime().nullable(), confirmedAt: z.string().datetime().nullable(), replacedByShiftId: uuid.nullable(), notes: z.string().nullable() }));
  const conflict = r.register("Conflict", z.object({ type: z.enum(["double_booking", "missing_qualification", "qualification_expired", "unavailable", "rest_time", "max_duration", "employee_inactive"]), hard: z.boolean(), message: z.string() }));
  const availability = r.register("Availability", availabilityInput.extend({ id: uuid }));
  const offer = r.register("PartnerOffer", offerInput.extend({ id: uuid, status: z.enum(["offered", "accepted", "partially_accepted", "declined", "withdrawn", "fulfilled"]), headcountCommitted: z.number() }));
  const timeRecord = r.register("TimeRecord", z.object({ id: uuid, importId: uuid.nullable(), employeeId: uuid.nullable(), employeeNumberRaw: z.string(), shiftId: uuid.nullable(), startedAt: z.string().datetime(), endedAt: z.string().datetime(), breakMinutes: z.number(), source: z.enum(["import", "manual", "api"]), status: z.enum(["raw", "matched", "unmatched", "reviewed", "rejected"]) }));
  const importResult = r.register("ImportResult", z.object({ importId: uuid, reference: z.string(), totalRows: z.number(), imported: z.number(), duplicates: z.number(), errors: z.array(z.object({ row: z.number(), message: z.string() })), unmatchedEmployees: z.array(z.string()), reconciliation: z.object({ matched: z.number(), deviations: z.number(), unplanned: z.number(), missing: z.number() }) }));
  const reconItem = r.register("ReconciliationItem", z.object({ id: uuid, shiftId: uuid.nullable(), timeRecordId: uuid.nullable(), employeeId: uuid.nullable(), kind: z.enum(["match", "deviation", "missing_record", "unplanned_record"]), status: z.enum(["open", "approved", "rejected", "corrected"]), plannedStart: z.string().datetime().nullable(), plannedEnd: z.string().datetime().nullable(), actualStart: z.string().datetime().nullable(), actualEnd: z.string().datetime().nullable(), deviationMinutes: z.number(), approvedStart: z.string().datetime().nullable(), approvedEnd: z.string().datetime().nullable() }));
  const document = r.register("Document", z.object({ id: uuid, entityType: z.string(), entityId: uuid, category: z.string(), title: z.string(), filename: z.string(), mimeType: z.string(), sizeBytes: z.number(), sha256: z.string(), version: z.number(), confidentiality: z.enum(["internal", "confidential", "shared"]), expiresAt: z.string().nullable() }));
  const webhook = r.register("WebhookEndpoint", endpointInput.extend({ id: uuid, active: z.boolean(), failureCount: z.number() }));
  const timeImportJson = r.register("TimeImportJson", z.object({ filename: z.string().optional(), force: z.boolean().optional(), rows: z.array(z.object({ employeeNumber: z.string(), startedAt: z.string().datetime(), endedAt: z.string().datetime(), breakMinutes: z.number().int().optional() })) }));

  const list = (path: string, tag: string, scope: string, query: z.ZodObject<z.ZodRawShape>, item: z.ZodTypeAny, summary: string, paginated = true) =>
    r.registerPath({ method: "get", path, tags: [tag], summary, description: `Scope: ${scope}`, security: sec, request: { query }, responses: { 200: { description: "OK", content: { "application/json": { schema: paginated ? page(item) : z.array(item) } } }, ...errors } });
  const create = (path: string, tag: string, scope: string, body: z.ZodTypeAny, item: z.ZodTypeAny, summary: string) =>
    r.registerPath({ method: "post", path, tags: [tag], summary, description: `Scope: ${scope}`, security: sec, request: { body: { content: { "application/json": { schema: body } } }, headers: idem }, responses: { 201: { description: "Angelegt", content: { "application/json": { schema: item } } }, ...errors } });
  const get = (path: string, tag: string, scope: string, item: z.ZodTypeAny, summary: string) =>
    r.registerPath({ method: "get", path, tags: [tag], summary, description: `Scope: ${scope}`, security: sec, request: { params: idParam }, responses: { 200: { description: "OK", content: { "application/json": { schema: item } } }, ...errors } });
  const patch = (path: string, tag: string, scope: string, body: z.ZodTypeAny, item: z.ZodTypeAny, summary: string) =>
    r.registerPath({ method: "patch", path, tags: [tag], summary, description: `Scope: ${scope}`, security: sec, request: { params: idParam, body: { content: { "application/json": { schema: body } } } }, responses: { 200: { description: "OK", content: { "application/json": { schema: item } } }, ...errors } });
  const action = (path: string, tag: string, scope: string, body: z.ZodTypeAny | null, item: z.ZodTypeAny, summary: string) =>
    r.registerPath({ method: "post", path, tags: [tag], summary, description: `Scope: ${scope}`, security: sec, request: { params: idParam, ...(body ? { body: { content: { "application/json": { schema: body } } } } : {}), headers: idem }, responses: { 200: { description: "OK", content: { "application/json": { schema: item } } }, ...errors } });

  list("/employees", "Employees", "employees:read", employeeListQuery, employee, "Mitarbeiter auflisten");
  create("/employees", "Employees", "employees:write", employeeInput, employee, "Mitarbeiter anlegen");
  get("/employees/{id}", "Employees", "employees:read", employee, "Mitarbeiter lesen");
  patch("/employees/{id}", "Employees", "employees:write", employeeInput.partial(), employee, "Mitarbeiter ändern");

  list("/customers", "Customers", "customers:read", customerListQuery, customer, "Kunden auflisten");
  create("/customers", "Customers", "customers:write", customerInput, customer, "Kunde anlegen");
  get("/customers/{id}", "Customers", "customers:read", customer, "Kunde lesen");
  patch("/customers/{id}", "Customers", "customers:write", customerInput.partial(), customer, "Kunde ändern");

  list("/customer-requests", "CustomerRequests", "requests:read", requestListQuery, request, "Anfragen auflisten");
  create("/customer-requests", "CustomerRequests", "requests:write", requestInput, request.extend({ duplicate: z.boolean() }), "Kundenanfrage anlegen (unverbindlich; Duplikaterkennung über externalRef und Fingerabdruck)");
  get("/customer-requests/{id}", "CustomerRequests", "requests:read", request, "Anfrage lesen");
  patch("/customer-requests/{id}", "CustomerRequests", "requests:write", requestInput.partial().extend({ status: z.string().optional() }), request, "Anfrage ändern / Status setzen (nicht: converted)");

  list("/events", "Events", "events:read", eventListQuery, event.extend({ staffing: z.object({ required: z.number(), filled: z.number(), pending: z.number() }) }), "Veranstaltungen auflisten");
  create("/events", "Events", "events:write", eventInputBase, event, "Veranstaltung anlegen (Status draft)");
  get("/events/{id}", "Events", "events:read", event.extend({ positions: z.array(position.extend({ filled: z.number(), pending: z.number(), open: z.number(), shifts: z.array(shift) })) }), "Veranstaltung mit Positionen und Schichten");
  patch("/events/{id}", "Events", "events:write", eventInputBase.partial().extend({ reason: z.string().optional() }), event, "Veranstaltung ändern (nach Bestätigung mit reason)");
  action("/events/{id}/positions", "Events", "events:write", positionInputBase, position, "Position mit Personalbedarf anlegen (erzeugt offene Slots)");
  patch("/positions/{id}", "Events", "events:write", positionInputBase.partial(), position, "Position ändern");

  list("/shifts", "Shifts", "shifts:read", shiftListQuery, shift, "Schichten auflisten (Filter: status, from, to, employeeId, customerId, eventId, overdue)");
  create("/shifts", "Shifts", "shifts:write", z.object({ positionId: uuid, startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional() }), shift, "Zusätzlichen offenen Slot anlegen");
  get("/shifts/{id}", "Shifts", "shifts:read", shift, "Schicht mit Verlauf");
  patch("/shifts/{id}", "Shifts", "shifts:write", shiftTimesInput, shift.extend({ conflicts: z.array(conflict) }), "Schichtzeit ändern");
  action("/shifts/{id}/assign", "Shifts", "shifts:assign", assignInput, shift.extend({ conflicts: z.array(conflict) }), "Mitarbeiter zuweisen (409 bei harten Konflikten; weiche nur mit overrideReason und shifts:override_conflict)");
  action("/shifts/{id}/respond", "Shifts", "shifts:respond_own | shifts:assign", respondInput, shift, "Zu-/Absage erfassen");
  action("/shifts/{id}/confirm", "Shifts", "shifts:assign", null, shift, "Zusage verbindlich bestätigen");
  action("/shifts/{id}/withdraw", "Shifts", "shifts:assign", z.object({ reason: z.string() }), shift, "Zuweisung zurückziehen");

  list("/availability", "Availability", "availability:read | portal:employee", z.object({ employeeId: uuid.optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional(), kind: z.enum(["available", "unavailable"]).optional() }), availability, "Verfügbarkeiten/Abwesenheiten", false);
  create("/availability", "Availability", "availability:write | availability:write_own", availabilityInput, availability, "Eintrag anlegen");

  list("/partners", "Partners", "partners:read", z.object({ q: z.string().optional(), status: z.string().optional() }), z.object({ id: uuid, name: z.string(), status: z.string() }), "Partner auflisten", false);
  list("/partner-offers", "Partners", "partners:read | portal:partner", z.object({ partnerId: uuid.optional(), status: z.string().optional() }), offer, "Positionsangebote", false);
  create("/partner-offers", "Partners", "partners:write", offerInput, z.object({ offer, missingQualifications: z.array(uuid) }), "Position einem Partner anbieten");
  action("/partner-offers/{id}/respond", "Partners", "partners:respond_own | partners:write", offerResponseInput, z.object({ offer, filled: z.number() }), "Rückmeldung des Partners");

  list("/time-records", "TimeRecords", "time:read", timeRecordListQuery, timeRecord, "Zeitnachweise");
  r.registerPath({ method: "post", path: "/time-records/import", tags: ["TimeRecords"], summary: "Zeitnachweise importieren", description: "Scope: time:import. multipart/form-data (file=CSV/XLSX, force) oder JSON (rows). Jeder Import erhält eine Kennung; Datei- und Zeilenduplikate werden erkannt. Startet den Soll-Ist-Abgleich.", security: sec, request: { body: { content: { "application/json": { schema: timeImportJson }, "multipart/form-data": { schema: z.object({ file: z.string().openapi({ format: "binary" }), force: z.string().optional() }) } } }, headers: idem }, responses: { 201: { description: "Import abgeschlossen", content: { "application/json": { schema: importResult } } }, ...errors } });
  list("/reconciliation-items", "Reconciliation", "time:read", reconListQuery, reconItem, "Abgleichseinträge");
  action("/reconciliation-items/{id}/approve", "Reconciliation", "time:approve", z.object({ note: z.string().optional() }), reconItem, "Ist-Zeit bestätigen");
  action("/reconciliation-items/{id}/correct", "Reconciliation", "time:correct", correctionInput, reconItem, "Korrektur mit Begründung (protokolliert)");
  r.registerPath({ method: "get", path: "/reconciliation-reports", tags: ["Reconciliation"], summary: "Prüfbericht (JSON-Zusammenfassung oder CSV)", description: "Scope: time:read", security: sec, request: { query: z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional(), format: z.enum(["json", "csv"]).optional(), status: z.string().optional() }) }, responses: { 200: { description: "OK", content: { "application/json": { schema: z.object({ total: z.number(), open: z.number(), preliminary: z.boolean(), byKindAndStatus: z.array(z.object({ kind: z.string(), status: z.string(), count: z.number(), deviation: z.number() })) }) }, "text/csv": { schema: z.string() } } }, ...errors } });

  list("/documents", "Documents", "documents:read | portal:*", z.object({ entityType: z.string().optional(), entityId: uuid.optional(), category: z.string().optional(), expiringDays: z.number().optional(), q: z.string().optional() }), document, "Dokumente auflisten (ohne Speicherpfade)", false);
  r.registerPath({ method: "post", path: "/documents", tags: ["Documents"], summary: "Dokument hochladen", description: "Scope: documents:write (Mitarbeiterdokumente: employees:documents; vertraulich: documents:confidential). Typ-, Größen- und Inhaltsprüfung.", security: sec, request: { body: { content: { "multipart/form-data": { schema: z.object({ file: z.string().openapi({ format: "binary" }), entityType: z.string(), entityId: uuid, title: z.string(), category: z.string().optional(), confidentiality: z.string().optional(), expiresAt: z.string().optional() }) } } } }, responses: { 201: { description: "Angelegt", content: { "application/json": { schema: document } } }, ...errors } });
  get("/documents/{id}/download", "Documents", "documents:read", z.object({ url: z.string(), expiresInSeconds: z.number(), singleUse: z.boolean() }), "Einmaligen Download-Link erzeugen");

  create("/inbound-email", "CustomerRequests", "requests:write", inboundEmailInput, z.object({ emailId: uuid, status: z.enum(["processed", "duplicate", "ignored"]), requestId: uuid.optional(), customerId: uuid.nullable().optional(), aiUsed: z.boolean() }), "Eingehende E-Mail als Anfrageentwurf verarbeiten (dedupliziert über messageId; Anhänge als Dokumente; KI-Vorschlag falls konfiguriert)");
  list("/notifications", "Notifications", "Sitzung", z.object({}), z.object({ id: uuid, title: z.string(), body: z.string(), readAt: z.string().nullable() }), "Eigene Benachrichtigungen (nur Sitzung)", false);

  list("/webhooks", "Webhooks", "webhooks:manage", z.object({}), webhook, "Webhook-Endpunkte", false);
  create("/webhooks", "Webhooks", "webhooks:manage", endpointInput, webhook.extend({ secret: z.string() }), "Webhook anlegen (Secret nur einmal sichtbar)");
  patch("/webhooks/{id}", "Webhooks", "webhooks:manage", endpointInput.partial().extend({ active: z.boolean().optional() }), webhook, "Webhook ändern");
  r.registerPath({ method: "delete", path: "/webhooks/{id}", tags: ["Webhooks"], summary: "Webhook löschen", security: sec, request: { params: idParam }, responses: { 200: { description: "Gelöscht" }, ...errors } });
  get("/webhooks/{id}/deliveries", "Webhooks", "webhooks:manage", z.array(z.object({ id: uuid, eventType: z.string(), status: z.string(), attempts: z.number(), lastStatusCode: z.number().nullable(), lastError: z.string().nullable() })), "Zustellungen");

  const gen = new OpenApiGeneratorV31(r.definitions);
  return gen.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "DispoRex API",
      version: "1.0.0",
      description: `REST-API der Dispositionsplattform DispoRex. Alle Antworten enthalten \`x-request-id\`. Fehlerformat: \`{ error: { code, message, details? }, requestId }\`. Pagination über page/pageSize. Idempotenz über \`Idempotency-Key\` bei POST.\n\nVerfügbare Scopes: ${PERMISSIONS.join(", ")}.\n\nWebhook-Ereignistypen: ${DOMAIN_EVENT_TYPES.join(", ")}. Signatur: Header \`X-DispoRex-Signature: t=<unix>,v1=<hmac_sha256(secret, "<t>.<body>")>\`.`,
    },
    servers: [{ url: `${baseUrl}/api/v1` }],
    tags: [{ name: "Employees" }, { name: "Customers" }, { name: "CustomerRequests" }, { name: "Events" }, { name: "Shifts" }, { name: "Availability" }, { name: "Partners" }, { name: "TimeRecords" }, { name: "Reconciliation" }, { name: "Documents" }, { name: "Notifications" }, { name: "Webhooks" }],
  });
}
