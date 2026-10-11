import { z } from "zod";

const optStr = (max: number) => z.string().trim().max(max).optional().nullable().or(z.literal("").transform(() => null));
const optDate = z.coerce.date().optional().nullable().or(z.literal("").transform(() => null));

export const requestedRole = z.object({ name: z.string().trim().min(1).max(80), count: z.number().int().min(1).max(500).optional(), qualifications: z.array(z.string().trim().max(60)).max(10).optional() });

export const requestInput = z.object({
  customerId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  title: z.string().trim().min(3).max(200),
  description: optStr(8000),
  contactName: optStr(120),
  contactEmail: z.string().trim().toLowerCase().email().max(254).optional().nullable().or(z.literal("").transform(() => null)),
  contactPhone: optStr(40),
  locationText: optStr(300),
  startsAt: optDate,
  endsAt: optDate,
  headcount: z.coerce.number().int().min(1).max(5000).optional().nullable().or(z.literal("").transform(() => null)),
  requestedRoles: z.array(requestedRole).max(30).optional().nullable(),
  externalRef: optStr(120),
  source: z.enum(["manual", "api", "email", "portal", "ai_draft"]).default("manual"),
});
export type RequestInput = z.infer<typeof requestInput>;

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  new: "Neu",
  in_review: "In Prüfung",
  needs_info: "Rückfrage",
  quoted: "Angebot gesendet",
  accepted: "Angenommen",
  declined: "Abgelehnt",
  converted: "Umgewandelt",
  duplicate: "Duplikat",
};

export const requestListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["new", "in_review", "needs_info", "quoted", "accepted", "declined", "converted", "duplicate", "open", "all"]).default("open"),
  customerId: z.string().uuid().optional(),
  sort: z.enum(["createdAt", "startsAt", "title", "status"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
