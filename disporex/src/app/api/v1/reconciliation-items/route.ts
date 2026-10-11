import { apiHandler, parseQuery, ok } from "@/server/api/handler";
import { listReconciliation, reconListQuery } from "@/server/modules/time/service";

export const dynamic = "force-dynamic";

export const GET = apiHandler({ permissions: ["time:read"] }, async ({ req, ctx }) => {
  const page = await listReconciliation(ctx, parseQuery(req, reconListQuery));
  return ok({ ...page, items: page.items.map((r) => ({ ...r.it, employeeName: r.employeeName, employeeNumber: r.employeeNumber, eventName: r.eventName, positionName: r.positionName })) });
});
