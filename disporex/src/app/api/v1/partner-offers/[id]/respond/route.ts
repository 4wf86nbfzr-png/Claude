import { z } from "zod";
import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { respondToOffer } from "@/server/modules/partners/service";
import { offerResponseInput } from "@/server/modules/partners/schema";

export const dynamic = "force-dynamic";

/** POST /api/v1/partner-offers/{id}/respond – Rückmeldung des Partners (Portalrolle oder API-Schlüssel mit partners:write). */
export const POST = apiHandler<{ id: string }>({ idempotent: true }, async ({ req, ctx, params }) => ok(await respondToOffer(ctx, z.string().uuid().parse(params.id), await parseBody(req, offerResponseInput))));
