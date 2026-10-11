import { z } from "zod";
import { apiHandler, parseQuery, ok } from "@/server/api/handler";
import { listDocuments, uploadDocument, uploadInput, type DocEntityType } from "@/server/modules/documents/service";
import { AppError } from "@/server/core/errors";

export const dynamic = "force-dynamic";
const q = z.object({ entityType: z.enum(["employee", "customer", "partner", "event", "tenant", "request", "time_import"]).optional(), entityId: z.string().uuid().optional(), category: z.string().optional(), expiringDays: z.coerce.number().int().optional(), q: z.string().optional() });

export const GET = apiHandler({}, async ({ req, ctx }) => {
  const p = parseQuery(req, q);
  const docs = await listDocuments(ctx, { ...p, entityType: p.entityType as DocEntityType | undefined });
  return ok(docs.map(({ storageKey: _s, ...d }) => d));
});

/** POST /api/v1/documents – multipart/form-data: file + entityType, entityId, title, category, confidentiality, expiresAt */
export const POST = apiHandler({ permissions: ["documents:write"] }, async ({ req, ctx }) => {
  const fd = await req.formData().catch(() => null);
  if (!fd) throw new AppError("multipart/form-data erwartet", 400, "validation_error");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new AppError("Feld `file` fehlt", 400, "validation_error");
  const meta = uploadInput.parse(Object.fromEntries([...fd.entries()].filter(([k]) => k !== "file").map(([k, v]) => [k, String(v)])));
  const doc = await uploadDocument(ctx, meta, { filename: file.name, mimeType: file.type || "application/octet-stream", data: Buffer.from(await file.arrayBuffer()) });
  const { storageKey: _s, ...rest } = doc;
  return ok(rest, { status: 201 });
});
