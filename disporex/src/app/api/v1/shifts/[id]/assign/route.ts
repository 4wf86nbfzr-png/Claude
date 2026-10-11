import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { assignShift, publicShift } from "@/server/modules/shifts/service";
import { assignInput } from "@/server/modules/shifts/schema";

export const dynamic = "force-dynamic";

/** POST /api/v1/shifts/{id}/assign – Mitarbeiter zuweisen; Konflikte liefern 409 mit Details. */
export const POST = apiHandler<{ id: string }>({ permissions: ["shifts:assign"], idempotent: true }, async ({ req, ctx, params }) => {
  const r = await assignShift(ctx, z.string().uuid().parse(params.id), await parseBody(req, assignInput));
  return ok({ ...publicShift(r.shift), conflicts: r.conflicts });
});
