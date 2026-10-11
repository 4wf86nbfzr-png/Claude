import { z } from "zod";
import { apiHandler, ok } from "@/server/api/handler";
import { importTimeRecords } from "@/server/modules/time/service";
import { AppError } from "@/server/core/errors";

export const dynamic = "force-dynamic";

const jsonImport = z.object({
  filename: z.string().max(200).default("api-import.json"),
  force: z.boolean().default(false),
  rows: z.array(z.object({ employeeNumber: z.string().min(1).max(60), startedAt: z.coerce.date(), endedAt: z.coerce.date(), breakMinutes: z.number().int().min(0).max(480).optional() })).min(1).max(20000),
});

/**
 * POST /api/v1/time-records/import
 * Entweder multipart/form-data mit Feld `file` (CSV/XLSX, optional `force=true`)
 * oder application/json mit `rows` (employeeNumber, startedAt, endedAt, breakMinutes).
 */
export const POST = apiHandler({ permissions: ["time:import"], idempotent: true }, async ({ req, ctx }) => {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("Feld `file` (CSV/XLSX) fehlt", 400, "validation_error");
    const res = await importTimeRecords(ctx, { filename: file.name, data: Buffer.from(await file.arrayBuffer()) }, { force: fd.get("force") === "true" });
    return ok(res, { status: 201 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("JSON oder multipart/form-data erwartet", 400, "invalid_json");
  }
  const body = jsonImport.parse(raw);
  const res = await importTimeRecords(ctx, { filename: body.filename, data: Buffer.from(JSON.stringify(body.rows)), format: "json" }, { force: body.force, rows: body.rows });
  return ok(res, { status: 201 });
});
