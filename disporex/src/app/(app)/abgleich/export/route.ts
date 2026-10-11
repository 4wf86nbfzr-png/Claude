import { NextResponse, type NextRequest } from "next/server";
import { getCurrent } from "@/server/auth/current";
import { exportReconciliationCsv } from "@/server/modules/time/service";
import { localToUtc } from "@/lib/tz";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const current = await getCurrent();
  if (!current) return new NextResponse("Anmeldung erforderlich", { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const query: Record<string, unknown> = { ...sp };
  if (sp.von) query.from = localToUtc(`${sp.von}T00:00`);
  if (sp.bis) query.to = localToUtc(`${sp.bis}T23:59`);
  const csv = await exportReconciliationCsv(current.ctx, query);
  return new NextResponse("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pruefbericht-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
