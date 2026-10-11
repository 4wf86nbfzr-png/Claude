import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { getRequest, updateRequest, publicRequest, setRequestStatus } from "@/server/modules/requests/service";
import { requestInput } from "@/server/modules/requests/schema";

export const dynamic = "force-dynamic";
const id = z.string().uuid();

export const GET = apiHandler<{ id: string }>({ permissions: ["requests:read"] }, async ({ ctx, params }) => {
  const d = await getRequest(ctx, id.parse(params.id));
  return ok({ ...publicRequest(d.request), customerName: d.customerName });
});

export const PATCH = apiHandler<{ id: string }>({ permissions: ["requests:write"] }, async ({ req, ctx, params }) => {
  const body = await parseBody(req, requestInput.partial().extend({ status: z.string().optional() }));
  const { status, ...data } = body;
  const rid = id.parse(params.id);
  let r = Object.keys(data).length ? await updateRequest(ctx, rid, data) : (await getRequest(ctx, rid)).request;
  if (status) r = await setRequestStatus(ctx, rid, status);
  return ok(publicRequest(r));
});
