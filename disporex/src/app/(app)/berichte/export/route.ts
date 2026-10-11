import { NextResponse, type NextRequest } from "next/server";
import { getCurrent } from "@/server/auth/current";
import { exportReportCsv, REPORT_LABELS, type ReportKey } from "@/server/modules/reports/service";
import { localToUtc } from "@/lib/tz";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const current = await getCurrent();
  if (!current) return new NextResponse("Anmeldung erforderlich", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const key = sp.get("bericht") ?? "staffing";
  if (!(key in REPORT_LABELS)) return new NextResponse("Unbekannter Bericht", { status: 400 });
  const von = sp.get("von") ?? "";
  const bis = sp.get("bis") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(von) || !/^\d{4}-\d{2}-\d{2}$/.test(bis)) return new NextResponse("Zeitraum fehlt", { status: 400 });
  const csv = await exportReportCsv(current.ctx, key as ReportKey, { from: localToUtc(`${von}T00:00`), to: localToUtc(`${bis}T23:59`) });
  return new NextResponse("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="bericht-${key}-${von}-${bis}.csv"` } });
}
