import { NextResponse } from "next/server";
import { getCurrent } from "@/server/auth/current";
import { exportEmployeesCsv } from "@/server/modules/employees/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getCurrent();
  if (!current) return NextResponse.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:3000"));
  const csv = await exportEmployeesCsv(current.ctx);
  return new NextResponse("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="mitarbeiter-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
