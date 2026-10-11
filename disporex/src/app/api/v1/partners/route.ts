import { z } from "zod";
import { apiHandler, parseQuery, ok } from "@/server/api/handler";
import { listPartners } from "@/server/modules/partners/service";

export const dynamic = "force-dynamic";

export const GET = apiHandler({ permissions: ["partners:read"] }, async ({ req, ctx }) => ok((await listPartners(ctx, parseQuery(req, z.object({ q: z.string().optional(), status: z.string().optional() })))).map((r) => ({ ...r.p, openOffers: r.openOffers, committed: r.committed }))));
