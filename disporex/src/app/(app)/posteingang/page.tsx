import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listInboundEmails } from "@/server/modules/email/inbound";
import { imapConfigured } from "@/server/modules/email/imap";
import { PageHeader, Panel, Table, Badge, EmptyState, Alert } from "@/components/ui";
import { ActionButton } from "@/components/ui/form";
import { ignoreEmailAction } from "../anfragen/ai-actions";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "E-Mail-Eingang" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { ctx } = await requireCurrent("requests:read");
  const mails = await listInboundEmails(ctx);
  return (
    <>
      <PageHeader title="E-Mail-Eingang" subtitle="Eingehende Kundenmails werden zu Anfrageentwürfen. Es wird nie automatisch geantwortet oder ein Auftrag erzeugt." />
      {!imapConfigured() && (
        <Alert tone="info" className="mb-4">
          Kein IMAP-Postfach konfiguriert (IMAP_HOST/USER/PASS). Alternativ liefert ein Mail-Provider-Webhook Nachrichten an <span className="mono">POST /api/v1/inbound-email</span> (API-Schlüssel mit Scope requests:write).
        </Alert>
      )}
      <Panel padded={false}>
        {mails.length === 0 ? (
          <EmptyState title="Noch keine E-Mails verarbeitet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Empfangen</th>
                <th>Absender</th>
                <th>Betreff</th>
                <th>Anhänge</th>
                <th>Status</th>
                <th>Anfrage</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mails.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-ink-3">{fmtDateTime(m.receivedAt)}</td>
                  <td>
                    {m.fromName && <div>{m.fromName}</div>}
                    <div className="mono text-[12px]">{m.fromAddress}</div>
                  </td>
                  <td>{m.subject}</td>
                  <td className="text-[12px] text-ink-3">{m.attachments.map((a) => a.filename).join(", ")}</td>
                  <td>
                    <Badge tone={m.status === "processed" ? "ok" : m.status === "failed" ? "danger" : "neutral"}>{m.status}</Badge>
                    {m.error && <div className="text-[12px] text-danger">{m.error}</div>}
                  </td>
                  <td>{m.requestId ? <Link href={`/anfragen/${m.requestId}`}>Anfrage öffnen</Link> : "–"}</td>
                  <td className="text-right">{m.status === "new" && ctx.permissions.has("requests:write") && <ActionButton action={ignoreEmailAction} label="Ignorieren" variant="ghost" hidden={{ id: m.id }} />}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
