import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listEmployees } from "@/server/modules/employees/service";
import { listQualifications } from "@/server/modules/qualifications/service";
import { AREA_LABELS, AREAS } from "@/server/modules/employees/schema";
import { PageHeader, Panel, Table, Badge, EmptyState, Input, Select, Button, LinkButton, Pagination } from "@/components/ui";

export const metadata = { title: "Mitarbeiter" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "ok" | "neutral" | "warn" | "danger" }> = {
  active: { label: "aktiv", tone: "ok" },
  inactive: { label: "inaktiv", tone: "neutral" },
  applicant: { label: "Bewerber", tone: "warn" },
  left: { label: "ausgeschieden", tone: "danger" },
};

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("employees:read");
  const sp = await searchParams;
  const [page, quals] = await Promise.all([listEmployees(ctx, sp), listQualifications(ctx)]);
  const qs = (p: number) => `/mitarbeiter?${new URLSearchParams({ ...sp, page: String(p) }).toString()}`;
  return (
    <>
      <PageHeader
        title="Mitarbeiter"
        subtitle={`${page.total} Datensätze`}
        actions={
          <>
            {ctx.permissions.has("employees:export") && (
              <Link className="btn btn-secondary" href="/mitarbeiter/export" prefetch={false}>
                CSV-Export
              </Link>
            )}
            {ctx.permissions.has("employees:import") && <LinkButton href="/mitarbeiter/import">Import</LinkButton>}
            {ctx.permissions.has("employees:write") && (
              <LinkButton href="/mitarbeiter/neu" variant="primary">
                Neuer Mitarbeiter
              </LinkButton>
            )}
          </>
        }
      />
      <form className="flex flex-wrap gap-2 mb-3 items-end">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Name, ID, E-Mail, Ort" aria-label="Suche" className="max-w-[260px]" />
        <Select name="status" defaultValue={sp.status ?? "active"} aria-label="Status" className="w-auto">
          <option value="active">Aktive</option>
          <option value="inactive">Inaktive</option>
          <option value="applicant">Bewerber</option>
          <option value="left">Ausgeschiedene</option>
          <option value="all">Alle</option>
        </Select>
        <Select name="area" defaultValue={sp.area ?? ""} aria-label="Einsatzbereich" className="w-auto">
          <option value="">Alle Bereiche</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {AREA_LABELS[a]}
            </option>
          ))}
        </Select>
        <Select name="qualificationId" defaultValue={sp.qualificationId ?? ""} aria-label="Qualifikation" className="w-auto">
          <option value="">Alle Qualifikationen</option>
          {quals.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </Select>
        <Select name="sort" defaultValue={sp.sort ?? "lastName"} aria-label="Sortierung" className="w-auto">
          <option value="lastName">Nach Name</option>
          <option value="employeeNumber">Nach ID</option>
          <option value="createdAt">Nach Anlagedatum</option>
        </Select>
        <Button type="submit">Filtern</Button>
      </form>
      <Panel padded={false}>
        {page.items.length === 0 ? (
          <EmptyState title="Keine Mitarbeiter gefunden" hint="Passen Sie die Filter an oder legen Sie den ersten Mitarbeiter an." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Bereiche</th>
                <th>Ort</th>
                <th>Kontakt</th>
                <th className="num">Qualif.</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{e.employeeNumber}</td>
                  <td>
                    <Link href={`/mitarbeiter/${e.id}`} className="font-medium">
                      {e.lastName}, {e.firstName}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={STATUS[e.status]?.tone}>{STATUS[e.status]?.label ?? e.status}</Badge>
                  </td>
                  <td className="text-[12.5px] text-ink-2">{e.areas.map((a) => AREA_LABELS[a] ?? a).join(", ")}</td>
                  <td>{e.city}</td>
                  <td className="text-[12.5px]">
                    {e.phone && <div className="mono">{e.phone}</div>}
                    {e.email && <div className="text-ink-3">{e.email}</div>}
                  </td>
                  <td className="num">{e.qualificationCount}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page.page} totalPages={page.totalPages} total={page.total} hrefFor={qs} />
      </Panel>
    </>
  );
}
