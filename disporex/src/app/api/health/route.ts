import { NextResponse } from "next/server";
import { getPool } from "@/server/db/client";

export const dynamic = "force-dynamic";

/** Health-Check für Load-Balancer/Monitoring. Prüft Datenbankverbindung. */
export async function GET() {
  const started = Date.now();
  try {
    await getPool().query("select 1");
    return NextResponse.json({ status: "ok", db: "ok", latencyMs: Date.now() - started, time: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ status: "degraded", db: "error", error: err instanceof Error ? err.message : "unbekannt" }, { status: 503 });
  }
}
