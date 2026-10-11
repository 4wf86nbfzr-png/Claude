import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { listPartners } from "@/server/modules/partners/service";
import { PageHeader, Panel, Table, Badge, EmptyState, Input, Select, Button, LinkButton } from "@/components/ui";

export const metadata = { title: "Partner" };
export const dynamic = "force-dynamic";

export default async function PartnersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("partners:read");
  const sp = await searchParams;
  const rows = await listPartners(ctx, { q: sp.q, status: sp.status });
  return (
    <>
      <PageHeader title="Partner und Nachunternehmer" subtitle="Partner sehen nur ausdrücklich freigegebene Positionsangebote." actions={ctx.permissions.has("partners:write") && <LinkButton href="/partner/neu" variant="primary">Neuer Partner</LinkButton>} />
      <form className="flex gap-2 mb-3">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Name" className="max-w-[220px]" aria-label="Suche" />
        <Select name="status" defaultValue={sp.status ?? "all"} className="w-auto" aria-label="Status">
          <option value="all">Alle</option>
          <option value="active">Aktive</option>
          <option value="pending">In Prüfung</option>
          <option value="inactive">Inaktive</option>
        </Select>
        <Button type="submit">Filtern</Button>
      </form>
      <Panel padded={false}>
        {rows.length === 0 ? (
          <EmptyState title="Keine Partner" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Ort</th>
                <th>Kontakt</th>
                <th className="num">Offene Angebote</th>
                <th className="num">Zugesagte Personen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, openOffers, committed }) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/partner/${p.id}`} className="font-medium">
                      {p.name}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={p.status === "active" ? "ok" : p.status === "pending" ? "warn" : "neutral"}>{p.status}</Badge>
                  </td>
                  <td>{p.city}</td>
                  <td className="text-[12.5px] text-ink-3">{p.email ?? p.phone}</td>
                  <td className="num">{openOffers}</td>
                  <td className="num">{committed}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
