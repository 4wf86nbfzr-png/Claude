import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listReconciliation, RECON_KIND_LABELS, RECON_STATUS_LABELS } from "@/server/modules/time/service";
import { listEmployees } from "@/server/modules/employees/service";
import { PageHeader, Panel, Table, Badge, EmptyState, Input, Select, Button, Pagination } from "@/components/ui";
import { fmtRange, fmtMinutes } from "@/lib/format";
import { localToUtc } from "@/lib/tz";

export const metadata = { title: "Soll-Ist-Abgleich" };
export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, "ok" | "neutral" | "warn" | "danger" | "info"> = { match: "ok", deviation: "warn", missing_record: "danger", unplanned_record: "info" };
const STATUS_TONE: Record<string, "ok" | "neutral" | "warn" | "danger" | "info"> = { open: "warn", approved: "ok", rejected: "danger", corrected: "info" };

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("time:read");
  const sp = await searchParams;
  const query: Record<string, unknown> = { ...sp };
  if (sp.von) query.from = localToUtc(`${sp.von}T00:00`);
  if (sp.bis) query.to = localToUtc(`${sp.bis}T23:59`);
  const [page, employees] = await Promise.all([listReconciliation(ctx, query), listEmployees(ctx, { pageSize: 300 })]);
  return (
    <>
      <PageHeader title="Soll-Ist-Abgleich" subtitle="Geplante gegen gemeldete Arbeitszeiten. Abweichungen werden nie automatisch übernommen – Prüfung und Bestätigung sind eigene Schritte." actions={ctx.permissions.has("reports:export") && <a className="btn btn-secondary" href={`/abgleich/export?${new URLSearchParams(sp)}`}>Prüfbericht (CSV)</a>} />
      <form className="flex flex-wrap gap-2 mb-3 items-end">
        <Select name="status" defaultValue={sp.status ?? "open"} className="w-auto" aria-label="Status">
          <option value="open">Offen</option>
          <option value="corrected">Korrigiert (unbestätigt)</option>
          <option value="approved">Bestätigt</option>
          <option value="rejected">Abgelehnt</option>
          <option value="all">Alle</option>
        </Select>
        <Select name="kind" defaultValue={sp.kind ?? "all"} className="w-auto" aria-label="Art">
          <option value="all">Alle Arten</option>
          {Object.entries(RECON_KIND_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select name="employeeId" defaultValue={sp.employeeId ?? ""} className="w-auto" aria-label="Mitarbeiter">
          <option value="">Alle Mitarbeiter</option>
          {employees.items.map((e) => (
            <option key={e.id} value={e.id}>
              {e.lastName}, {e.firstName}
            </option>
          ))}
        </Select>
        <Input name="von" type="date" defaultValue={sp.von ?? ""} className="w-auto" aria-label="Von" />
        <Input name="bis" type="date" defaultValue={sp.bis ?? ""} className="w-auto" aria-label="Bis" />
        <Button type="submit">Filtern</Button>
      </form>
      <Panel padded={false}>
        {page.items.length === 0 ? (
          <EmptyState title="Keine Einträge" hint="Importieren Sie Zeitnachweise, um den Abgleich zu starten." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Einsatz</th>
                <th>Geplant</th>
                <th>Gemeldet</th>
                <th className="num">Abweichung</th>
                <th>Art</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map(({ it, employeeName, employeeNumber, eventName, positionName, eventId }) => (
                <tr key={it.id}>
                  <td>
                    <Link href={`/abgleich/${it.id}`} className="font-medium">
                      {employeeName ?? "–"}
                    </Link>
                    <div className="mono text-[12px] text-ink-4">{employeeNumber}</div>
                  </td>
                  <td className="text-[12.5px]">
                    {eventId ? <Link href={`/veranstaltungen/${eventId}`}>{eventName}</Link> : <span className="text-ink-4">kein Einsatz</span>}
                    {positionName && <div className="text-ink-3">{positionName}</div>}
                  </td>
                  <td className="mono whitespace-nowrap text-[12px]">{it.plannedStart && it.plannedEnd ? fmtRange(it.plannedStart, it.plannedEnd) : "–"}</td>
                  <td className="mono whitespace-nowrap text-[12px]">{it.actualStart && it.actualEnd ? fmtRange(it.actualStart, it.actualEnd) : "–"}</td>
                  <td className={`num ${it.deviationMinutes > 0 ? "text-warn" : it.deviationMinutes < 0 ? "text-danger" : ""}`}>{it.kind === "match" ? "±0" : fmtMinutes(it.deviationMinutes)}</td>
                  <td>
                    <Badge tone={KIND_TONE[it.kind]}>{RECON_KIND_LABELS[it.kind]}</Badge>
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[it.status]}>{RECON_STATUS_LABELS[it.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page.page} totalPages={page.totalPages} total={page.total} hrefFor={(p) => `/abgleich?${new URLSearchParams({ ...sp, page: String(p) })}`} />
      </Panel>
    </>
  );
}
