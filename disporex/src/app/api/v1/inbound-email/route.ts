import { apiHandler, parseBody, ok } from "@/server/api/handler";
import { ingestInboundEmail, inboundEmailInput } from "@/server/modules/email/inbound";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/inbound-email – Eingang einer E-Mail als Anfrageentwurf
 * (für Mail-Provider-Webhooks wie Postmark/Mailgun/SES nach Normalisierung,
 * oder eigene Weiterleitungsskripte). Scope: requests:write. Dedupliziert über messageId.
 */
export const POST = apiHandler({ permissions: ["requests:write"], idempotent: true, rateLimitPerMinute: 120 }, async ({ req, ctx }) => {
  const body = await parseBody(req, inboundEmailInput);
  const r = await ingestInboundEmail(ctx, body);
  return ok(r, { status: r.status === "duplicate" ? 200 : 201 });
});
