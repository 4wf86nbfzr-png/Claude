import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { deleteEndpoint, updateEndpoint, endpointInput } from "@/server/modules/webhooks/service";

export const dynamic = "force-dynamic";
const id = z.string().uuid();

export const PATCH = apiHandler<{ id: string }>({ permissions: ["webhooks:manage"] }, async ({ req, ctx, params }) => {
  const r = await updateEndpoint(ctx, id.parse(params.id), await parseBody(req, endpointInput.partial().extend({ active: z.boolean().optional() })));
  const { secretEncrypted: _s, ...ep } = r;
  return ok(ep);
});
export const DELETE = apiHandler<{ id: string }>({ permissions: ["webhooks:manage"] }, async ({ ctx, params }) => {
  await deleteEndpoint(ctx, id.parse(params.id));
  return ok({ deleted: true });
});
