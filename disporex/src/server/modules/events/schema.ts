import { z } from "zod";

const optStr = (max: number) => z.string().trim().max(max).optional().nullable().or(z.literal("").transform(() => null));
const optDate = z.coerce.date().optional().nullable().or(z.literal("").transform(() => null));
const optUuid = z.string().uuid().optional().nullable().or(z.literal("").transform(() => null));

export const eventInputBase = z.object({
    customerId: z.string().uuid(),
    locationId: optUuid,
    contactId: optUuid,
    name: z.string().trim().min(2).max(200),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    setupStartsAt: optDate,
    teardownEndsAt: optDate,
    dresscode: optStr(500),
    briefing: optStr(8000),
    meetingPoint: optStr(500),
    specialNotes: optStr(4000),
    internalNotes: optStr(4000),
    billingNotes: optStr(2000),
});
export const eventInput = eventInputBase.refine((e) => e.endsAt > e.startsAt, { message: "Ende muss nach Beginn liegen.", path: ["endsAt"] });
export type EventInput = z.infer<typeof eventInput>;

export const positionInputBase = z.object({
    name: z.string().trim().min(1).max(120),
    headcountRequired: z.coerce.number().int().min(1).max(500),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    breakMinutes: z.coerce.number().int().min(0).max(480).default(0),
    requiredQualificationIds: z.array(z.string().uuid()).max(20).default([]),
    dresscode: optStr(500),
    notes: optStr(2000),
    billingCategory: optStr(60),
});
export const positionInput = positionInputBase.refine((p) => p.endsAt > p.startsAt, { message: "Ende muss nach Beginn liegen.", path: ["endsAt"] });
export type PositionInput = z.infer<typeof positionInput>;

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  planned: "Geplant",
  confirmed: "Bestätigt",
  in_progress: "Läuft",
  completed: "Abgeschlossen",
  cancelled: "Abgesagt",
};
export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  offered: "Angeboten",
  confirmed: "Bestätigt",
  changed: "Geändert",
  cancelled: "Storniert",
  completed: "Abgeschlossen",
};

export const eventListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["draft", "planned", "confirmed", "in_progress", "completed", "cancelled", "active", "all"]).default("active"),
  customerId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(["startsAt", "name", "createdAt", "status"]).default("startsAt"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
