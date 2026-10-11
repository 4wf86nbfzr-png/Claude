import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { updatePosition } from "@/server/modules/events/service";
import { positionInputBase } from "@/server/modules/events/schema";

export const dynamic = "force-dynamic";

export const PATCH = apiHandler<{ id: string }>({ permissions: ["events:write"] }, async ({ req, ctx, params }) => ok(await updatePosition(ctx, z.string().uuid().parse(params.id), await parseBody(req, positionInputBase.partial()))));
