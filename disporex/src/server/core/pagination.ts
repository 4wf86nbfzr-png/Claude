import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type Pagination = z.infer<typeof paginationSchema>;

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function toPage<T>(items: T[], total: number, p: Pagination): Page<T> {
  return { items, page: p.page, pageSize: p.pageSize, total, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) };
}

export function offsetOf(p: Pagination): number {
  return (p.page - 1) * p.pageSize;
}

export function sortSchema<const T extends readonly [string, ...string[]]>(fields: T, defaultField: T[number]) {
  return z.object({
    sort: z.enum(fields).default(defaultField as T[number]),
    dir: z.enum(["asc", "desc"]).default("asc"),
  });
}
