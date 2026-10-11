import { z } from "zod";

export const SHIFT_STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  requested: "Angefragt",
  accepted: "Zugesagt",
  declined: "Abgesagt",
  no_response: "Keine Rückmeldung",
  confirmed: "Bestätigt",
  withdrawn: "Zurückgezogen",
  replaced: "Ersetzt",
  cancelled: "Storniert",
};

export const shiftListQuery = z.object({
  status: z.enum(["open", "requested", "accepted", "declined", "no_response", "confirmed", "withdrawn", "replaced", "cancelled", "active", "all"]).default("all"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  employeeId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  overdue: z.coerce.boolean().optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(["startsAt", "status", "eventName", "employeeName"]).default("startsAt"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type ShiftListQuery = z.infer<typeof shiftListQuery>;

export const assignInput = z.object({
  employeeId: z.string().uuid(),
  /** direct: sofort bestätigt (z. B. telefonisch zugesagt); request: Anfrage mit Frist. */
  mode: z.enum(["request", "direct"]).default("request"),
  overrideReason: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export const respondInput = z.object({
  response: z.enum(["accepted", "declined"]),
  note: z.string().trim().max(500).optional().nullable(),
});

export const shiftTimesInput = z
  .object({ startsAt: z.coerce.date(), endsAt: z.coerce.date(), breakMinutes: z.coerce.number().int().min(0).max(480).optional(), reason: z.string().trim().max(500).optional().nullable() })
  .refine((v) => v.endsAt > v.startsAt, { message: "Ende muss nach Beginn liegen.", path: ["endsAt"] });
