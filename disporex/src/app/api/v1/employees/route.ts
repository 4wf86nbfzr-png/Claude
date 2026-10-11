import { apiHandler, parseBody, parseQuery, ok } from "@/server/api/handler";
import { listEmployees, createEmployee } from "@/server/modules/employees/service";
import { employeeInput, employeeListQuery } from "@/server/modules/employees/schema";

export const dynamic = "force-dynamic";

export const GET = apiHandler({ permissions: ["employees:read"] }, async ({ req, ctx }) => ok(await listEmployees(ctx, parseQuery(req, employeeListQuery))));

export const POST = apiHandler({ permissions: ["employees:write"], idempotent: true }, async ({ req, ctx }) => {
  const e = await createEmployee(ctx, await parseBody(req, employeeInput));
  return ok(e, { status: 201 });
});
