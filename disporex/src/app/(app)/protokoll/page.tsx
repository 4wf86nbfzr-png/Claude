import { requireCurrent } from "@/server/auth/current";
import { withTenant } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { desc, eq, and, sql } from "drizzle-orm";
import { PageHeader, Panel, Table, EmptyState, Input, Button, Pagination } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { paginationSchema, offsetOf, toPage } from "@/server/core/pagination";

export const metadata = { title: "Protokoll" };
export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ctx } = await requireCurrent("audit:read");
  const sp = await searchParams;
  const p = paginationSchema.parse(sp);
  const q = (sp.q ?? "").trim();
  const where = and(eq(auditLogs.tenantId, ctx.tenantId), q ? sql`(${auditLogs.action} ilike ${"%" + q + "%"} or ${auditLogs.entityType} ilike ${"%" + q + "%"} or ${auditLogs.actorLabel} ilike ${"%" + q + "%"})` : sql`true`);
  const { items, total } = await withTenant(ctx.tenantId, async (tx) => {
    const items = await tx.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(p.pageSize).offset(offsetOf(p));
    const total = (await tx.select({ c: sql<number>`count(*)::int` }).from(auditLogs).where(where))[0]?.c ?? 0;
    return { items, total };
  });
  const page = toPage(items, total, p);
  return (
    <>
      <PageHeader title="Änderungs- und Sicherheitsprotokoll" subtitle="Wer hat wann was geändert. Geheimnisse werden nie protokolliert." />
      <form className="flex gap-2 mb-3 max-w-md">
        <Input name="q" defaultValue={q} placeholder="Aktion, Objekt oder Benutzer" aria-label="Suche im Protokoll" />
        <Button type="submit">Filtern</Button>
      </form>
      <Panel padded={false}>
        {items.length === 0 ? (
          <EmptyState title="Keine Einträge" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Akteur</th>
                <th>Aktion</th>
                <th>Objekt</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-ink-3">{fmtDateTime(a.createdAt)}</td>
                  <td>{a.actorLabel ?? (a.actorUserId ? "Benutzer" : "System")}</td>
                  <td className="mono text-[12px]">{a.action}</td>
                  <td className="text-[12px]">
                    {a.entityType}
                    {a.entityId && <span className="text-ink-4"> {a.entityId.slice(0, 8)}</span>}
                  </td>
                  <td className="text-[12px] text-ink-3 max-w-[420px]">
                    {a.reason && <div>Grund: {a.reason}</div>}
                    {(a.before !== null || a.after !== null) && (
                      <details>
                        <summary className="cursor-pointer">Änderung anzeigen</summary>
                        <pre className="text-[11px] whitespace-pre-wrap break-all mt-1">{JSON.stringify({ vorher: a.before, nachher: a.after }, null, 1)}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page.page} totalPages={page.totalPages} total={page.total} hrefFor={(n) => `/protokoll?q=${encodeURIComponent(q)}&page=${n}`} />
      </Panel>
    </>
  );
}
