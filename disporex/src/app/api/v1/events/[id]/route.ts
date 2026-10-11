import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { getEvent, updateEvent, publicEvent } from "@/server/modules/events/service";
import { eventInputBase } from "@/server/modules/events/schema";
import { publicShift } from "@/server/modules/shifts/service";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export const GET = apiHandler<{ id: string }>({ permissions: ["events:read"] }, async ({ ctx, params }) => {
  const id = idSchema.parse(params.id);
  const d = await getEvent(ctx, id);
  return ok({
    ...publicEvent(d.event),
    customerName: d.customerName,
    location: d.location,
    positions: d.positions.map((p) => ({
      id: p.id,
      name: p.name,
      headcountRequired: p.headcountRequired,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      breakMinutes: p.breakMinutes,
      requiredQualificationIds: p.requiredQualificationIds,
      filled: p.filled,
      pending: p.pending,
      open: p.open,
      shifts: p.shifts.map((s) => ({ ...publicShift(s), employeeName: s.employeeName })),
    })),
    order: d.order ? { id: d.order.id, orderNumber: d.order.orderNumber, status: d.order.status, confirmedAt: d.order.confirmedAt } : null,
  });
});

export const PATCH = apiHandler<{ id: string }>({ permissions: ["events:write"] }, async ({ req, ctx, params }) => {
  const id = idSchema.parse(params.id);
  const body = await parseBody(req, eventInputBase.partial().extend({ reason: z.string().max(500).optional() }));
  const { reason, ...data } = body;
  const e = await updateEvent(ctx, id, data, reason);
  return ok(publicEvent(e));
});
