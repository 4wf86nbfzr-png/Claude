import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listEvents } from "@/server/modules/events/service";
import { listCustomers } from "@/server/modules/customers/service";
import { EVENT_STATUS_LABELS } from "@/server/modules/events/schema";
import { PageHeader, Panel, Table, Badge, EmptyState, Input, Select, Button, LinkButton, Pagination } from "@/components/ui";
import { fmtRange } from "@/lib/format";
import { localToUtc } from "@/lib/tz";

export const metadata = { title: "Veranstaltungen" };
export const dynamic = "force-dynamic";

const TONE: Record<string, "ok" | "neutral" | "warn" | "danger" | "info" | "accent"> = { draft: "neutral", planned: "info", confirmed: "ok", in_progress: "accent", completed: "neutral", cancelled: "danger" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("events:read");
  const sp = await searchParams;
  const query: Record<string, unknown> = { ...sp };
  if (sp.von) query.from = localToUtc(`${sp.von}T00:00`);
  if (sp.bis) query.to = localToUtc(`${sp.bis}T23:59`);
  if (sp.zeitraum === "7") {
    query.from = new Date();
    query.to = new Date(Date.now() + 7 * 86_400_000);
  }
  const [page, customers] = await Promise.all([listEvents(ctx, query), listCustomers(ctx, { pageSize: 200, status: "all" })]);
  return (
    <>
      <PageHeader title="Veranstaltungen" subtitle={`${page.total} Einträge`} actions={ctx.permissions.has("events:write") && <LinkButton href="/veranstaltungen/neu" variant="primary">Neue Veranstaltung</LinkButton>} />
      <form className="flex flex-wrap gap-2 mb-3 items-end">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Name oder Kunde" className="max-w-[220px]" aria-label="Suche" />
        <Select name="status" defaultValue={sp.status ?? "active"} className="w-auto" aria-label="Status">
          <option value="active">Aktive (Entwurf bis laufend)</option>
          {Object.entries(EVENT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
          <option value="all">Alle</option>
        </Select>
        <Select name="customerId" defaultValue={sp.customerId ?? ""} className="w-auto" aria-label="Kunde">
          <option value="">Alle Kunden</option>
          {customers.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input name="von" type="date" defaultValue={sp.von ?? ""} aria-label="Von" className="w-auto" />
        <Input name="bis" type="date" defaultValue={sp.bis ?? ""} aria-label="Bis" className="w-auto" />
        <Button type="submit">Filtern</Button>
      </form>
      <Panel padded={false}>
        {page.items.length === 0 ? (
          <EmptyState title="Keine Veranstaltungen" hint="Legen Sie eine Veranstaltung an oder wandeln Sie eine Kundenanfrage um." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Veranstaltung</th>
                <th>Kunde</th>
                <th>Ort</th>
                <th>Status</th>
                <th className="num">Besetzung</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((e) => {
                const open = Math.max(0, e.required - e.filled - e.pending);
                return (
                  <tr key={e.id}>
                    <td className="mono whitespace-nowrap">{fmtRange(e.startsAt, e.endsAt)}</td>
                    <td>
                      <Link href={`/veranstaltungen/${e.id}`} className="font-medium">
                        {e.name}
                      </Link>
                    </td>
                    <td>{e.customerName}</td>
                    <td className="text-ink-3">{e.locationName}</td>
                    <td>
                      <Badge tone={TONE[e.status]}>{EVENT_STATUS_LABELS[e.status]}</Badge>
                    </td>
                    <td className="num">
                      {e.filled}/{e.required}
                      {e.pending > 0 && <Badge tone="info">{e.pending} angefragt</Badge>} {open > 0 && e.status !== "cancelled" && <Badge tone="warn">{open} offen</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={page.page} totalPages={page.totalPages} total={page.total} hrefFor={(p) => `/veranstaltungen?${new URLSearchParams({ ...sp, page: String(p) })}`} />
      </Panel>
    </>
  );
}
