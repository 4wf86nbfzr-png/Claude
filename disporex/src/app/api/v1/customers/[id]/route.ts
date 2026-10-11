import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { getCustomer, updateCustomer } from "@/server/modules/customers/service";
import { customerInput } from "@/server/modules/customers/schema";

export const dynamic = "force-dynamic";
const id = z.string().uuid();

export const GET = apiHandler<{ id: string }>({ permissions: ["customers:read"] }, async ({ ctx, params }) => {
  const d = await getCustomer(ctx, id.parse(params.id));
  return ok({ ...d.customer, contacts: d.contacts, locations: d.locations, events: d.events });
});
export const PATCH = apiHandler<{ id: string }>({ permissions: ["customers:write"] }, async ({ req, ctx, params }) => ok(await updateCustomer(ctx, id.parse(params.id), await parseBody(req, customerInput.partial()))));
