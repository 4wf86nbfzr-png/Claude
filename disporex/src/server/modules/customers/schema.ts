import { z } from "zod";

const optStr = (max: number) => z.string().trim().max(max).optional().nullable().or(z.literal("").transform(() => null));

export const addressSchema = z.object({ street: optStr(120), zip: optStr(12), city: optStr(80), country: optStr(60) });

export const customerInput = z.object({
  customerNumber: optStr(40),
  name: z.string().trim().min(2).max(160),
  legalName: optStr(200),
  status: z.enum(["lead", "active", "inactive", "blocked"]).default("active"),
  email: z.string().trim().toLowerCase().email().max(254).optional().nullable().or(z.literal("").transform(() => null)),
  phone: optStr(40),
  website: optStr(200),
  billingAddress: addressSchema.optional().nullable(),
  billingEmail: z.string().trim().toLowerCase().email().max(254).optional().nullable().or(z.literal("").transform(() => null)),
  vatId: optStr(30),
  paymentTermsDays: optStr(5),
  requirements: optStr(4000),
  notes: optStr(4000),
});
export type CustomerInput = z.infer<typeof customerInput>;

export const contactInput = z.object({
  name: z.string().trim().min(2).max(120),
  role: optStr(80),
  email: z.string().trim().toLowerCase().email().max(254).optional().nullable().or(z.literal("").transform(() => null)),
  phone: optStr(40),
  isPrimary: z.boolean().default(false),
});

export const locationInput = z.object({
  customerId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  name: z.string().trim().min(2).max(160),
  street: optStr(120),
  zip: optStr(12),
  city: optStr(80),
  country: optStr(60),
  notes: optStr(2000),
});

export const customerListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["lead", "active", "inactive", "blocked", "all"]).default("all"),
  sort: z.enum(["name", "customerNumber", "createdAt"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});
