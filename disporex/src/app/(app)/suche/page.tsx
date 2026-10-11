import Link from "next/link";
import { requireCurrent } from "@/server/auth/current";
import { globalSearch } from "@/server/modules/search/service";
import { PageHeader, Panel, EmptyState } from "@/components/ui";

export const metadata = { title: "Suche" };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx } = await requireCurrent("search:use");
  const { q = "" } = await searchParams;
  const r = q.trim().length >= 2 ? await globalSearch(ctx, q) : { hits: [], groups: {} };
  return (
    <>
      <PageHeader title={`Suche: „${q}“`} subtitle={`${r.hits.length} Treffer in Ihrem Unternehmen und Ihren Berechtigungsbereichen`} />
      {q.trim().length < 2 ? (
        <Panel>
          <p className="text-[13px] text-ink-3">Mindestens zwei Zeichen eingeben.</p>
        </Panel>
      ) : r.hits.length === 0 ? (
        <Panel>
          <EmptyState title="Keine Treffer" />
        </Panel>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {Object.entries(r.groups).map(([group, hits]) => (
            <Panel key={group} title={`${group} (${hits.length})`} padded={false}>
              <ul className="divide-y divide-line">
                {hits.map((h) => (
                  <li key={h.id} className="px-4 py-2.5">
                    <Link href={h.href} className="font-medium">
                      {h.title}
                    </Link>
                    {h.subtitle && <div className="text-[12.5px] text-ink-3">{h.subtitle}</div>}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
