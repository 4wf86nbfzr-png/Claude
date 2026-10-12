import type { NextRequest } from "next/server";
import { forward } from "../api/[...path]/route";

export const dynamic = "force-dynamic";
export const GET = (request: NextRequest) => forward(request, "/health");
