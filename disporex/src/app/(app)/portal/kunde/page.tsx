import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listRequests } from "@/server/modules/requests/service";
import { listOrders, listEvents } from "@/server/modules/events/service";
import { listDocuments } from "@/server/modules/documents/service";
import { REQUEST_STATUS_LABELS } from "@/server/modules/requests/schema";
import { ORDER_STATUS_LABELS, EVENT_STATUS_LABELS } from "@/server/modules/events/schema";
import { PageHeader, Panel, Badge, EmptyState, Alert, LinkButton } from "@/components/ui";
import { fmtRange, fmtDateTime } from "@/lib/format";

export const metadata = { title: "Kundenportal" };
export const dynamic = "force-dynamic";

export default async function CustomerPortalPage() {
  const { ctx } = await requireCurrent("portal:customer");
  if (!ctx.customerId) return <Alert tone="warn">Ihr Konto ist keinem Kunden zugeordnet.</Alert>;
  const [requests, orders, events, docs] = await Promise.all([listRequests(ctx, { status: "all", pageSize: 100 }), listOrders(ctx), listEvents(ctx, { status: "all", pageSize: 100 }), listDocuments(ctx)]);
  const releasedEventIds = new Set(orders.map((o) => o.o.eventId));
  return (
    <>
      <PageHeader title="Kundenportal" subtitle="Ihre Anfragen und freigegebenen Aufträge." actions={<LinkButton href="/anfragen/neu" variant="primary">Neue Anfrage</LinkButton>} />
      <div className="grid xl:grid-cols-2 gap-4 items-start">
        <Panel title="Anfragen" padded={false}>
          {requests.items.length === 0 ? (
            <EmptyState title="Noch keine Anfragen" />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Titel</th>
                  <th>Termin</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/anfragen/${r.id}`}>{r.title}</Link>
                    </td>
                    <td className="text-ink-3">{r.startsAt ? fmtDateTime(r.startsAt) : "offen"}</td>
                    <td>
                      <Badge>{REQUEST_STATUS_LABELS[r.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Freigegebene Aufträge" padded={false}>
          {orders.length === 0 ? (
            <EmptyState title="Noch keine freigegebenen Aufträge" />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Veranstaltung</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(({ o, eventName, eventStartsAt }) => {
                  const ev = events.items.find((e) => e.id === o.eventId);
                  return (
                    <tr key={o.id}>
                      <td className="mono">{o.orderNumber}</td>
                      <td>
                        {o.eventId && releasedEventIds.has(o.eventId) ? <Link href={`/veranstaltungen/${o.eventId}`}>{eventName}</Link> : eventName}
                        {ev && <div className="text-[12px] text-ink-3">{fmtRange(ev.startsAt, ev.endsAt)} · {EVENT_STATUS_LABELS[ev.status]}</div>}
                        {!ev && eventStartsAt && <div className="text-[12px] text-ink-3">{fmtDateTime(eventStartsAt)}</div>}
                      </td>
                      <td>
                        <Badge tone={o.status === "confirmed" ? "ok" : "neutral"}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Dokumente">
          {docs.length === 0 ? (
            <p className="text-[13px] text-ink-3">Keine freigegebenen Dokumente.</p>
          ) : (
            <ul className="text-[13px] space-y-1">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link href={`/dokumente/${d.id}`}>{d.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
