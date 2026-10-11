import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { correctItem, correctionInput } from "@/server/modules/time/service";

export const dynamic = "force-dynamic";

export const POST = apiHandler<{ id: string }>({ permissions: ["time:correct"], idempotent: true }, async ({ req, ctx, params }) => ok(await correctItem(ctx, z.string().uuid().parse(params.id), await parseBody(req, correctionInput))));
