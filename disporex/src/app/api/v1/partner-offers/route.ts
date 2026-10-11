import { z } from "zod";
import { apiHandler, parseBody, parseQuery, ok } from "@/server/api/handler";
import { listOffersFor, createOffer } from "@/server/modules/partners/service";
import { offerInput } from "@/server/modules/partners/schema";

export const dynamic = "force-dynamic";

export const GET = apiHandler({}, async ({ req, ctx }) => ok((await listOffersFor(ctx, parseQuery(req, z.object({ partnerId: z.string().uuid().optional(), status: z.string().optional() })))).map((r) => ({ ...r.o, partnerName: r.partnerName, positionName: r.positionName, eventName: r.eventName, positionStartsAt: r.positionStartsAt, positionEndsAt: r.positionEndsAt }))));
export const POST = apiHandler({ permissions: ["partners:write"], idempotent: true }, async ({ req, ctx }) => ok(await createOffer(ctx, await parseBody(req, offerInput)), { status: 201 }));
