import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listShifts } from "@/server/modules/shifts/service";
import { listCustomers, listLocations } from "@/server/modules/customers/service";
import { listEmployees } from "@/server/modules/employees/service";
import { SHIFT_STATUS_LABELS } from "@/server/modules/shifts/schema";
import { PageHeader, Panel, Table, Badge, EmptyState, Input, Select, Button, Pagination } from "@/components/ui";
import { fmtRange, fmtDateTime } from "@/lib/format";
import { localToUtc } from "@/lib/tz";

export const metadata = { title: "Schichten" };
export const dynamic = "force-dynamic";

const TONE: Record<string, "ok" | "neutral" | "warn" | "danger" | "info" | "accent"> = { open: "warn", requested: "info", accepted: "accent", confirmed: "ok", declined: "danger", no_response: "danger", withdrawn: "neutral", replaced: "neutral", cancelled: "neutral" };

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("shifts:read");
  const sp = await searchParams;
  const query: Record<string, unknown> = { ...sp };
  if (sp.von) query.from = localToUtc(`${sp.von}T00:00`);
  if (sp.bis) query.to = localToUtc(`${sp.bis}T23:59`);
  if (sp.ueberfaellig) query.overdue = true;
  if (!sp.status) query.status = "all";
  const [page, customers, locations, employees] = await Promise.all([listShifts(ctx, query), listCustomers(ctx, { pageSize: 200, status: "all" }), listLocations(ctx), listEmployees(ctx, { pageSize: 200 })]);
  return (
    <>
      <PageHeader title="Schichten" subtitle={`${page.total} Einträge · einzelne Einsätze aller Veranstaltungen`} />
      <form className="flex flex-wrap gap-2 mb-3 items-end">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Veranstaltung, Mitarbeiter, Position" className="max-w-[220px]" aria-label="Suche" />
        <Select name="status" defaultValue={sp.status ?? "all"} className="w-auto" aria-label="Status">
          <option value="all">Alle Status</option>
          <option value="active">Zugewiesen (angefragt/zugesagt/bestätigt)</option>
          {Object.entries(SHIFT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select name="customerId" defaultValue={sp.customerId ?? ""} className="w-auto" aria-label="Kunde">
          <option value="">Alle Kunden</option>
          {customers.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
        <Select name="locationId" defaultValue={sp.locationId ?? ""} className="w-auto" aria-label="Ort">
          <option value="">Alle Orte</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Input name="von" type="date" defaultValue={sp.von ?? ""} aria-label="Von" className="w-auto" />
        <Input name="bis" type="date" defaultValue={sp.bis ?? ""} aria-label="Bis" className="w-auto" />
        <label className="flex items-center gap-1 text-[13px]">
          <input type="checkbox" name="ueberfaellig" value="1" defaultChecked={Boolean(sp.ueberfaellig)} /> nur überfällige Rückmeldungen
        </label>
        <Button type="submit">Filtern</Button>
        <a className="btn btn-secondary" href={`/schichten/export?${new URLSearchParams(sp)}`}>
          CSV
        </a>
      </form>
      <Panel padded={false}>
        {page.items.length === 0 ? (
          <EmptyState title="Keine Schichten für diese Filter" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Veranstaltung</th>
                <th>Position</th>
                <th>Mitarbeiter</th>
                <th>Status</th>
                <th>Frist</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((s) => (
                <tr key={s.id}>
                  <td className="mono whitespace-nowrap">
                    <Link href={`/schichten/${s.id}`}>{fmtRange(s.startsAt, s.endsAt)}</Link>
                  </td>
                  <td>
                    <Link href={`/veranstaltungen/${s.eventId}`}>{s.eventName}</Link>
                    <div className="text-[12px] text-ink-3">
                      {s.customerName}
                      {s.locationName ? ` · ${s.locationName}` : ""}
                    </div>
                  </td>
                  <td>{s.positionName}</td>
                  <td>{s.employeeId ? <Link href={`/mitarbeiter/${s.employeeId}`}>{s.employeeName}</Link> : s.partnerName ?? <span className="text-ink-4">–</span>}</td>
                  <td>
                    <Badge tone={TONE[s.status]}>{SHIFT_STATUS_LABELS[s.status]}</Badge>
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {s.status === "requested" && s.responseDeadlineAt && (
                      <>
                        {fmtDateTime(s.responseDeadlineAt)} {s.responseDeadlineAt < new Date() && <Badge tone="danger">überfällig</Badge>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page.page} totalPages={page.totalPages} total={page.total} hrefFor={(p) => `/schichten?${new URLSearchParams({ ...sp, page: String(p) })}`} />
      </Panel>
    </>
  );
}
