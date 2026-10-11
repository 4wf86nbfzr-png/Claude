import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { getShift, updateShiftTimes, publicShift } from "@/server/modules/shifts/service";
import { shiftTimesInput } from "@/server/modules/shifts/schema";

export const dynamic = "force-dynamic";
const id = z.string().uuid();

export const GET = apiHandler<{ id: string }>({ permissions: ["shifts:read"] }, async ({ ctx, params }) => {
  const d = await getShift(ctx, id.parse(params.id));
  return ok({ ...publicShift(d.shift), event: { id: d.event.id, name: d.event.name, status: d.event.status }, position: { id: d.position.id, name: d.position.name }, employee: d.employee ? { id: d.employee.id, employeeNumber: d.employee.employeeNumber, firstName: d.employee.firstName, lastName: d.employee.lastName } : null, history: d.history });
});

export const PATCH = apiHandler<{ id: string }>({ permissions: ["shifts:write"] }, async ({ req, ctx, params }) => {
  const r = await updateShiftTimes(ctx, id.parse(params.id), await parseBody(req, shiftTimesInput));
  return ok({ ...publicShift(r.shift), conflicts: r.conflicts });
});
