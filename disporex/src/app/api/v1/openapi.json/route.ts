import { NextResponse } from "next/server";
import { buildOpenApi } from "@/server/api/openapi";
import { env } from "@/server/core/env";

export const dynamic = "force-dynamic";

/** Öffentliche OpenAPI-3.1-Spezifikation. */
export async function GET() {
  return NextResponse.json(buildOpenApi(env().APP_URL), { headers: { "cache-control": "public, max-age=300" } });
}
