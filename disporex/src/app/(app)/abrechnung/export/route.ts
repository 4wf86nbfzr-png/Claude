import { NextResponse, type NextRequest } from "next/server";
import { getCurrent } from "@/server/auth/current";
import { exportBillingCsv } from "@/server/modules/billing/service";
import { localToUtc } from "@/lib/tz";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const current = await getCurrent();
  if (!current) return new NextResponse("Anmeldung erforderlich", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const von = sp.get("von");
  const bis = sp.get("bis");
  const csv = await exportBillingCsv(current.ctx, { customerId: sp.get("customerId") || undefined, status: (sp.get("status") as "all") || "all", from: von ? localToUtc(`${von}T00:00`) : undefined, to: bis ? localToUtc(`${bis}T23:59`) : undefined });
  return new NextResponse("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="abrechnung-${von ?? "alle"}-${bis ?? ""}.csv"` } });
}
