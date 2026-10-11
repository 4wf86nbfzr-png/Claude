import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { getEmployee, updateEmployee } from "@/server/modules/employees/service";
import { employeeInput } from "@/server/modules/employees/schema";

export const dynamic = "force-dynamic";
const id = z.string().uuid();

export const GET = apiHandler<{ id: string }>({ permissions: ["employees:read"] }, async ({ ctx, params }) => {
  const d = await getEmployee(ctx, id.parse(params.id));
  return ok({ ...d.employee, qualifications: d.qualifications, upcomingShifts: d.upcomingShifts });
});

export const PATCH = apiHandler<{ id: string }>({ permissions: ["employees:write"] }, async ({ req, ctx, params }) => ok(await updateEmployee(ctx, id.parse(params.id), await parseBody(req, employeeInput.partial()))));
