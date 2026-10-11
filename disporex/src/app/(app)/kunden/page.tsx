import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listCustomers } from "@/server/modules/customers/service";
import { PageHeader, Panel, Table, Badge, EmptyState, Input, Select, Button, LinkButton, Pagination } from "@/components/ui";

export const metadata = { title: "Kunden" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "ok" | "neutral" | "warn" | "danger" }> = {
  lead: { label: "Interessent", tone: "warn" },
  active: { label: "aktiv", tone: "ok" },
  inactive: { label: "inaktiv", tone: "neutral" },
  blocked: { label: "gesperrt", tone: "danger" },
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("customers:read");
  const sp = await searchParams;
  const page = await listCustomers(ctx, sp);
  return (
    <>
      <PageHeader title="Kunden" subtitle={`${page.total} Kunden`} actions={ctx.permissions.has("customers:write") && <LinkButton href="/kunden/neu" variant="primary">Neuer Kunde</LinkButton>} />
      <form className="flex flex-wrap gap-2 mb-3">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Name, Nummer, E-Mail" className="max-w-[260px]" aria-label="Suche" />
        <Select name="status" defaultValue={sp.status ?? "all"} className="w-auto" aria-label="Status">
          <option value="all">Alle Status</option>
          <option value="lead">Interessenten</option>
          <option value="active">Aktive</option>
          <option value="inactive">Inaktive</option>
          <option value="blocked">Gesperrte</option>
        </Select>
        <Button type="submit">Filtern</Button>
      </form>
      <Panel padded={false}>
        {page.items.length === 0 ? (
          <EmptyState title="Keine Kunden gefunden" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Nummer</th>
                <th>Name</th>
                <th>Status</th>
                <th>Ort</th>
                <th>Kontakt</th>
                <th className="num">Veranst.</th>
                <th className="num">Offene Anfragen</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.customerNumber}</td>
                  <td>
                    <Link href={`/kunden/${c.id}`} className="font-medium">
                      {c.name}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={STATUS[c.status]?.tone}>{STATUS[c.status]?.label}</Badge>
                  </td>
                  <td>{c.billingAddress?.city}</td>
                  <td className="text-[12.5px] text-ink-3">{c.email ?? c.phone}</td>
                  <td className="num">{c.eventCount}</td>
                  <td className="num">{c.openRequests > 0 ? <Badge tone="warn">{c.openRequests}</Badge> : "0"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page.page} totalPages={page.totalPages} total={page.total} hrefFor={(p) => `/kunden?${new URLSearchParams({ ...sp, page: String(p) })}`} />
      </Panel>
    </>
  );
}
