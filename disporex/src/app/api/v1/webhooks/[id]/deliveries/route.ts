import { z } from "zod";
import { apiHandler, ok } from "@/server/api/handler";
import { listDeliveries } from "@/server/modules/webhooks/service";

export const dynamic = "force-dynamic";

export const GET = apiHandler<{ id: string }>({ permissions: ["webhooks:manage"] }, async ({ ctx, params }) => ok(await listDeliveries(ctx, z.string().uuid().parse(params.id))));
