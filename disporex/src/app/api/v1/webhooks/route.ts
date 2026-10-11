import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { listEndpoints, createEndpoint, endpointInput } from "@/server/modules/webhooks/service";

export const dynamic = "force-dynamic";

export const GET = apiHandler({ permissions: ["webhooks:manage"] }, async ({ ctx }) => ok(await listEndpoints(ctx)));
export const POST = apiHandler({ permissions: ["webhooks:manage"], idempotent: true }, async ({ req, ctx }) => {
  const r = await createEndpoint(ctx, await parseBody(req, endpointInput));
  const { secretEncrypted: _s, ...ep } = r.endpoint;
  return ok({ ...ep, secret: r.secret }, { status: 201 });
});
