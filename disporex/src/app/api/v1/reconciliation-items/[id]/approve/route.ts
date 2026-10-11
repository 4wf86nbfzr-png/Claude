import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { approveItem } from "@/server/modules/time/service";

export const dynamic = "force-dynamic";

export const POST = apiHandler<{ id: string }>({ permissions: ["time:approve"], idempotent: true }, async ({ req, ctx, params }) => {
  const b = await parseBody(req, z.object({ note: z.string().max(500).optional() }));
  return ok(await approveItem(ctx, z.string().uuid().parse(params.id), b.note));
});
