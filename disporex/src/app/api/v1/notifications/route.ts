import { apiHandler, ok } from "@/server/api/handler";
import { listMyNotifications } from "@/server/modules/notifications/service";

export const dynamic = "force-dynamic";

/** GET /api/v1/notifications – In-App-Benachrichtigungen des angemeldeten Benutzers (nur Sitzung). */
export const GET = apiHandler({}, async ({ ctx }) => ok(ctx.userId ? await listMyNotifications(ctx) : []));
