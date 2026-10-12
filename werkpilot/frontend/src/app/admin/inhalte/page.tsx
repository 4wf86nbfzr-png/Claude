"use client";

import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { fmtDay } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type C = { id: string; slug: string; title: string; kind: string; status: string; target_keyword: string | null; audience: string | null; checks: Record<string, unknown>; published_at: string | null; meta_description: string | null; body_markdown: string };

export default function Inhalte() {
  const { data } = useApi<C[]>("/api/admin/content");
  const tone = (s: string) => (s === "published" ? "ok" : s === "review" ? "warn" : "neutral");
  return (
    <>
      <PageHeader title="Inhalte" lead="Vom Marketing-Agenten erstellte Artikel. Veröffentlichung nur nach bestandenen Prüfungen (Qualität, Fakten, Rechte, Sicherheit) und Freigabe. Veröffentlichte Artikel erscheinen unter /ratgeber." />
      {!data?.length ? <Empty>Noch keine Inhalte – der Marketing-Agent erstellt täglich höchstens einen Entwurf.</Empty> : <div className="space-y-3">{data.map((c) => <Card key={c.id} title={c.title} action={<Badge tone={tone(c.status)}>{c.status}</Badge>}><p className="text-xs text-muted">{c.kind} · {c.target_keyword} · {c.audience} · {c.published_at ? `veröffentlicht ${fmtDay(c.published_at)}` : "unveröffentlicht"}</p><p className="mt-1 text-sm text-ink-2">{c.meta_description}</p><details className="mt-2 text-xs"><summary className="cursor-pointer">Prüfungen & Text</summary><pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(c.checks, null, 1)}</pre><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm">{c.body_markdown}</pre></details></Card>)}</div>}
    </>
  );
}
