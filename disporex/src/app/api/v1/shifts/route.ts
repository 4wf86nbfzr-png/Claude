import { z } from "zod";
import { apiHandler, parseBody, parseQuery, ok } from "@/server/api/handler";
import { listShifts, addSlot, publicShift } from "@/server/modules/shifts/service";
import { shiftListQuery } from "@/server/modules/shifts/schema";

export const dynamic = "force-dynamic";

export const GET = apiHandler({ permissions: ["shifts:read"] }, async ({ req, ctx }) => {
  const page = await listShifts(ctx, parseQuery(req, shiftListQuery));
  return ok({ ...page, items: page.items.map((s) => ({ ...publicShift(s), eventName: s.eventName, positionName: s.positionName, employeeName: s.employeeName, customerName: s.customerName })) });
});

const createSlot = z.object({ positionId: z.string().uuid(), startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional() });

/** POST /api/v1/shifts – zusätzlichen offenen Slot für eine Position anlegen. */
export const POST = apiHandler({ permissions: ["shifts:write"], idempotent: true }, async ({ req, ctx }) => {
  const b = await parseBody(req, createSlot);
  return ok(publicShift(await addSlot(ctx, b.positionId, { startsAt: b.startsAt, endsAt: b.endsAt })), { status: 201 });
});
