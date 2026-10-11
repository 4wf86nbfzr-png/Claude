import { z } from "zod";
import { apiHandler, parseBody, parseQuery, ok } from "@/server/api/handler";
import { listAvailabilities, createAvailability, availabilityInput } from "@/server/modules/availability/service";

export const dynamic = "force-dynamic";
const q = z.object({ employeeId: z.string().uuid().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), kind: z.enum(["available", "unavailable"]).optional() });

export const GET = apiHandler({}, async ({ req, ctx }) => ok((await listAvailabilities(ctx, parseQuery(req, q))).map((r) => ({ ...r.a, employeeNumber: r.employeeNumber }))));
export const POST = apiHandler({ idempotent: true }, async ({ req, ctx }) => ok(await createAvailability(ctx, await parseBody(req, availabilityInput)), { status: 201 }));
