import { z } from "zod";
import { apiHandler, ok } from "@/server/api/handler";
import { confirmShift, publicShift } from "@/server/modules/shifts/service";

export const dynamic = "force-dynamic";

export const POST = apiHandler<{ id: string }>({ permissions: ["shifts:assign"] }, async ({ ctx, params }) => ok(publicShift(await confirmShift(ctx, z.string().uuid().parse(params.id)))));
