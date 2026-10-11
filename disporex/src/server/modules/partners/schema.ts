import { z } from "zod";

const optStr = (max: number) => z.string().trim().max(max).optional().nullable().or(z.literal("").transform(() => null));

export const partnerInput = z.object({
  name: z.string().trim().min(2).max(160),
  status: z.enum(["active", "inactive", "pending"]).default("active"),
  email: z.string().trim().toLowerCase().email().max(254).optional().nullable().or(z.literal("").transform(() => null)),
  phone: optStr(40),
  city: optStr(80),
  qualificationIds: z.array(z.string().uuid()).max(30).default([]),
  complianceNotes: optStr(4000),
  notes: optStr(4000),
});
export type PartnerInput = z.infer<typeof partnerInput>;

export const partnerContactInput = z.object({
  name: z.string().trim().min(2).max(120),
  role: optStr(80),
  email: z.string().trim().toLowerCase().email().max(254).optional().nullable().or(z.literal("").transform(() => null)),
  phone: optStr(40),
  isPrimary: z.boolean().default(false),
});

export const offerInput = z.object({
  partnerId: z.string().uuid(),
  positionId: z.string().uuid(),
  headcountRequested: z.coerce.number().int().min(1).max(500),
  message: optStr(2000),
  shareBriefing: z.boolean().default(true),
  deadlineAt: z.coerce.date().optional().nullable().or(z.literal("").transform(() => null)),
});

export const offerResponseInput = z.object({
  response: z.enum(["accepted", "partially_accepted", "declined"]),
  headcountCommitted: z.coerce.number().int().min(0).max(500).default(0),
  responseNote: optStr(2000),
  /** Namen des gestellten Personals (für Einsatzlisten). */
  staffNames: z.array(z.string().trim().min(1).max(120)).max(500).default([]),
});

export const OFFER_STATUS_LABELS: Record<string, string> = {
  offered: "Angeboten",
  accepted: "Angenommen",
  partially_accepted: "Teilweise angenommen",
  declined: "Abgelehnt",
  withdrawn: "Zurückgezogen",
  fulfilled: "Erfüllt",
};
