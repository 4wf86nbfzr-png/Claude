import { apiHandler, parseQuery, ok } from "@/server/api/handler";
import { listTimeRecords, timeRecordListQuery } from "@/server/modules/time/service";

export const dynamic = "force-dynamic";

export const GET = apiHandler({ permissions: ["time:read"] }, async ({ req, ctx }) => ok(await listTimeRecords(ctx, parseQuery(req, timeRecordListQuery))));
