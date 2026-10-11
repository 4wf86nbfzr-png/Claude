import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { createPosition } from "@/server/modules/events/service";
import { positionInput } from "@/server/modules/events/schema";

export const dynamic = "force-dynamic";

/** POST /api/v1/events/{id}/positions – Position mit Personalbedarf anlegen (erzeugt offene Slots). */
export const POST = apiHandler<{ id: string }>({ permissions: ["events:write"], idempotent: true }, async ({ req, ctx, params }) => ok(await createPosition(ctx, z.string().uuid().parse(params.id), await parseBody(req, positionInput)), { status: 201 }));
