import { z } from "zod";

export const employeeInput = z.object({
  employeeNumber: z.string().trim().max(40).optional().nullable(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254).optional().nullable().or(z.literal("").transform(() => null)),
  phone: z.string().trim().max(40).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  status: z.enum(["active", "inactive", "applicant", "left"]).default("active"),
  employmentType: z.string().trim().max(60).optional().nullable(),
  areas: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  notes: z.string().trim().max(4000).optional().nullable(),
  orgNotes: z.string().trim().max(4000).optional().nullable(),
});
export type EmployeeInput = z.infer<typeof employeeInput>;

export const employeeListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["active", "inactive", "applicant", "left", "all"]).default("active"),
  area: z.string().trim().max(40).optional(),
  qualificationId: z.string().uuid().optional(),
  sort: z.enum(["lastName", "employeeNumber", "createdAt", "status"]).default("lastName"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});
export type EmployeeListQuery = z.infer<typeof employeeListQuery>;

export const employeeQualificationInput = z.object({
  qualificationId: z.string().uuid(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("").transform(() => null)),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("").transform(() => null)),
  note: z.string().trim().max(500).optional().nullable(),
});

export const EMPLOYMENT_TYPES = ["festanstellung", "teilzeit", "minijob", "kurzfristig", "werkstudent", "freiberuflich", "sonstiges"] as const;
export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  festanstellung: "Festanstellung",
  teilzeit: "Teilzeit",
  minijob: "Minijob",
  kurzfristig: "Kurzfristige Beschäftigung",
  werkstudent: "Werkstudent/in",
  freiberuflich: "Freiberuflich / Selbstständig",
  sonstiges: "Sonstiges",
};
export const AREAS = ["security", "ordnung", "gastro", "promotion", "logistik", "fahrservice", "reinigung"] as const;
export const AREA_LABELS: Record<string, string> = {
  security: "Sicherheit",
  ordnung: "Ordnungsdienst",
  gastro: "Gastronomie",
  promotion: "Promotion / Hostess",
  logistik: "Logistik",
  fahrservice: "Fahrservice",
  reinigung: "Reinigung",
};
