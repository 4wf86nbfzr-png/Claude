import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { respondToShift, publicShift } from "@/server/modules/shifts/service";
import { respondInput } from "@/server/modules/shifts/schema";

export const dynamic = "force-dynamic";

export const POST = apiHandler<{ id: string }>({ idempotent: true }, async ({ req, ctx, params }) => ok(publicShift(await respondToShift(ctx, z.string().uuid().parse(params.id), await parseBody(req, respondInput)))));
