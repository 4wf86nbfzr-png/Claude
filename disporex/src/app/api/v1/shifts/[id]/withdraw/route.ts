import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { withdrawShift, publicShift } from "@/server/modules/shifts/service";

export const dynamic = "force-dynamic";

export const POST = apiHandler<{ id: string }>({ permissions: ["shifts:assign"] }, async ({ req, ctx, params }) => {
  const b = await parseBody(req, z.object({ reason: z.string().min(1).max(500) }));
  return ok(publicShift(await withdrawShift(ctx, z.string().uuid().parse(params.id), b.reason)));
});
