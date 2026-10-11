import { z } from "zod";
import { NextResponse } from "next/server";
import { apiHandler, parseQuery, ok } from "@/server/api/handler";
import { reconciliationSummary, exportReconciliationCsv } from "@/server/modules/time/service";

export const dynamic = "force-dynamic";
const q = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), format: z.enum(["json", "csv"]).default("json"), status: z.enum(["open", "approved", "rejected", "corrected", "all"]).default("all") });

/** GET /api/v1/reconciliation-reports – Zusammenfassung (JSON) oder Prüfbericht (format=csv). */
export const GET = apiHandler({ permissions: ["time:read"] }, async ({ req, ctx }) => {
  const p = parseQuery(req, q);
  if (p.format === "csv") {
    const csv = await exportReconciliationCsv(ctx, { from: p.from, to: p.to, status: p.status });
    return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8" } });
  }
  return ok(await reconciliationSummary(ctx, { from: p.from, to: p.to }));
});
