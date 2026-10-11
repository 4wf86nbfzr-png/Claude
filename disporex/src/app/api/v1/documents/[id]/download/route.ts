import { z } from "zod";
import { apiHandler, ok } from "@/server/api/handler";
import { createDownloadLink } from "@/server/modules/documents/service";

export const dynamic = "force-dynamic";

/** GET /api/v1/documents/{id}/download – liefert einen einmaligen, 10 Minuten gültigen Link. */
export const GET = apiHandler<{ id: string }>({}, async ({ ctx, params }) => ok({ url: await createDownloadLink(ctx, z.string().uuid().parse(params.id)), expiresInSeconds: 600, singleUse: true }));
