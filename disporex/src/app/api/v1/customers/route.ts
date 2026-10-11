import { apiHandler, parseBody, parseQuery, ok } from "@/server/api/handler";
import { listCustomers, createCustomer } from "@/server/modules/customers/service";
import { customerInput, customerListQuery } from "@/server/modules/customers/schema";

export const dynamic = "force-dynamic";

export const GET = apiHandler({ permissions: ["customers:read"] }, async ({ req, ctx }) => ok(await listCustomers(ctx, parseQuery(req, customerListQuery))));
export const POST = apiHandler({ permissions: ["customers:write"], idempotent: true }, async ({ req, ctx }) => ok(await createCustomer(ctx, await parseBody(req, customerInput)), { status: 201 }));
