import { requireCurrent } from "@/server/auth/current";
import { listFailedDeliveries } from "@/server/modules/notifications/service";
import { PageHeader, Panel, Table, Badge, EmptyState } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { mailConfigured } from "@/server/modules/mail/mailer";

export const metadata = { title: "Zustellung" };
export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const { ctx } = await requireCurrent("notifications:admin");
  const rows = await listFailedDeliveries(ctx, 200);
  const failed = rows.filter((r) => r.n.status === "failed").length;
  return (
    <>
      <PageHeader title="Zustellung externer Benachrichtigungen" subtitle={`E-Mail-Kanal: ${mailConfigured() ? "SMTP konfiguriert" : "nicht konfiguriert – Nachrichten werden nur protokolliert"} · ${failed} fehlgeschlagen`} />
      <Panel padded={false}>
        {rows.length === 0 ? (
          <EmptyState title="Noch keine externen Zustellungen" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Kanal</th>
                <th>Empfänger</th>
                <th>Betreff</th>
                <th>Status</th>
                <th className="num">Versuche</th>
                <th>Fehler</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ n, userName }) => (
                <tr key={n.id}>
                  <td className="whitespace-nowrap text-ink-3">{fmtDateTime(n.createdAt)}</td>
                  <td>{n.channel}</td>
                  <td className="text-[12.5px]">
                    {userName} <span className="text-ink-4">{n.recipientAddress}</span>
                  </td>
                  <td>{n.title}</td>
                  <td>
                    <Badge tone={n.status === "sent" ? "ok" : n.status === "failed" ? "danger" : n.status === "pending" ? "info" : "neutral"}>{n.status}</Badge>
                  </td>
                  <td className="num">{n.attempts}</td>
                  <td className="text-[12px] text-danger max-w-[320px] truncate" title={n.lastError ?? ""}>
                    {n.lastError}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
