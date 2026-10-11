import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listRequests } from "@/server/modules/requests/service";
import { REQUEST_STATUS_LABELS } from "@/server/modules/requests/schema";
import { PageHeader, Panel, Table, Badge, EmptyState, Input, Select, Button, LinkButton, Pagination } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { labelMissing } from "@/server/modules/requests/service";

export const metadata = { title: "Kundenanfragen" };
export const dynamic = "force-dynamic";

const TONE: Record<string, "ok" | "neutral" | "warn" | "danger" | "info" | "accent"> = { new: "info", in_review: "accent", needs_info: "warn", quoted: "accent", accepted: "ok", declined: "danger", converted: "ok", duplicate: "neutral" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("requests:read");
  const sp = await searchParams;
  const page = await listRequests(ctx, sp);
  return (
    <>
      <PageHeader title="Kundenanfragen" subtitle="Unverbindliche Anfragen – werden erst durch Umwandlung und Auftragsbestätigung verbindlich." actions={ctx.permissions.has("requests:write") && <LinkButton href="/anfragen/neu" variant="primary">Anfrage erfassen</LinkButton>} />
      <form className="flex flex-wrap gap-2 mb-3">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Titel, Kontakt, Ort" className="max-w-[260px]" aria-label="Suche" />
        <Select name="status" defaultValue={sp.status ?? "open"} className="w-auto" aria-label="Status">
          <option value="open">Offene</option>
          {Object.entries(REQUEST_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
          <option value="all">Alle</option>
        </Select>
        <Button type="submit">Filtern</Button>
      </form>
      <Panel padded={false}>
        {page.items.length === 0 ? (
          <EmptyState title="Keine Anfragen" hint="Anfragen kommen per Formular, API, E-Mail oder manuell herein." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Eingang</th>
                <th>Titel</th>
                <th>Kunde / Kontakt</th>
                <th>Termin</th>
                <th className="num">Bedarf</th>
                <th>Status</th>
                <th>Fehlend</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((r) => (
                <tr key={r.id}>
                  <td className="text-ink-3 whitespace-nowrap" title={fmtDateTime(r.createdAt)}>
                    {fmtRelative(r.createdAt)} <span className="text-ink-4">· {r.source}</span>
                  </td>
                  <td>
                    <Link href={`/anfragen/${r.id}`} className="font-medium">
                      {r.title}
                    </Link>
                  </td>
                  <td className="text-[12.5px]">
                    {r.customerName ?? <span className="text-ink-4">kein Kunde</span>}
                    {r.contactName && <div className="text-ink-3">{r.contactName}</div>}
                  </td>
                  <td className="whitespace-nowrap">{r.startsAt ? fmtDateTime(r.startsAt) : <span className="text-ink-4">offen</span>}</td>
                  <td className="num">{r.headcount ?? "–"}</td>
                  <td>
                    <Badge tone={TONE[r.status]}>{REQUEST_STATUS_LABELS[r.status]}</Badge>
                  </td>
                  <td className="text-[12px] text-warn">{r.missingFields.map(labelMissing).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page.page} totalPages={page.totalPages} total={page.total} hrefFor={(p) => `/anfragen?${new URLSearchParams({ ...sp, page: String(p) })}`} />
      </Panel>
    </>
  );
}
