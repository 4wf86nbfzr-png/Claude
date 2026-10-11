import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listOrders } from "@/server/modules/events/service";
import { ORDER_STATUS_LABELS } from "@/server/modules/events/schema";
import { PageHeader, Panel, Table, Badge, EmptyState, Select, Button } from "@/components/ui";
import { fmtDateTime, fmtDate } from "@/lib/format";

export const metadata = { title: "Aufträge" };
export const dynamic = "force-dynamic";

const TONE: Record<string, "ok" | "neutral" | "warn" | "danger" | "info" | "accent"> = { draft: "neutral", offered: "info", confirmed: "ok", changed: "warn", cancelled: "danger", completed: "neutral" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("orders:read");
  const sp = await searchParams;
  const rows = await listOrders(ctx, { status: sp.status });
  return (
    <>
      <PageHeader title="Aufträge" subtitle="Verbindliche Aufträge je Veranstaltung. Bestätigung und Änderungen werden auf der Veranstaltungsseite verwaltet." />
      <form className="flex gap-2 mb-3">
        <Select name="status" defaultValue={sp.status ?? "all"} className="w-auto" aria-label="Status">
          <option value="all">Alle Status</option>
          {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Button type="submit">Filtern</Button>
      </form>
      <Panel padded={false}>
        {rows.length === 0 ? (
          <EmptyState title="Keine Aufträge" hint="Aufträge entstehen beim Umwandeln einer Anfrage oder direkt auf der Veranstaltungsseite." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Nummer</th>
                <th>Kunde</th>
                <th>Veranstaltung</th>
                <th>Status</th>
                <th>Bestätigt</th>
                <th>Angelegt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ o, customerName, eventName, eventStartsAt }) => (
                <tr key={o.id}>
                  <td className="mono">{o.orderNumber}</td>
                  <td>{customerName}</td>
                  <td>
                    {o.eventId ? (
                      <Link href={`/veranstaltungen/${o.eventId}`}>
                        {eventName} <span className="text-ink-4">({fmtDate(eventStartsAt)})</span>
                      </Link>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td>
                    <Badge tone={TONE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                  </td>
                  <td className="text-ink-3">{fmtDateTime(o.confirmedAt)}</td>
                  <td className="text-ink-3">{fmtDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
