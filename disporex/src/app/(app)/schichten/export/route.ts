import { NextResponse, type NextRequest } from "next/server";
import { getCurrent } from "@/server/auth/current";
import { listShifts } from "@/server/modules/shifts/service";
import { stringify } from "csv-stringify/sync";
import { SHIFT_STATUS_LABELS } from "@/server/modules/shifts/schema";
import { localToUtc } from "@/lib/tz";

export const dynamic = "force-dynamic";

/** CSV-Export der gefilterten Schichtliste (z. B. für Excel oder Kundenübersichten). */
export async function GET(req: NextRequest) {
  const current = await getCurrent();
  if (!current) return new NextResponse("Anmeldung erforderlich", { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const query: Record<string, unknown> = { ...sp, pageSize: 500 };
  if (sp.von) query.from = localToUtc(`${sp.von}T00:00`);
  if (sp.bis) query.to = localToUtc(`${sp.bis}T23:59`);
  if (!sp.status) query.status = "all";
  const page = await listShifts(current.ctx, query);
  const rows = page.items.map((s) => ({
    beginn: s.startsAt.toISOString(),
    ende: s.endsAt.toISOString(),
    veranstaltung: s.eventName,
    kunde: s.customerName,
    ort: s.locationName ?? "",
    position: s.positionName,
    mitarbeiter: s.employeeName ?? s.partnerName ?? "",
    mitarbeiter_id: s.employeeNumber ?? "",
    status: SHIFT_STATUS_LABELS[s.status] ?? s.status,
  }));
  const csv = stringify(rows, { header: true, delimiter: ";" });
  return new NextResponse("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="schichten.csv"` } });
}
