"use client";

import { Badge, Card, Empty, PageHeader, Table, inputCls } from "@/components/ui";
import { api, fmtDay } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type L = { id: string; company: string; contact_name: string | null; email: string | null; trade: string | null; size: string | null; source: string; consent_basis: string | null; fit_score: number | null; fit_reasons: string[]; status: string; next_action: string | null; next_action_at: string | null; notes: string | null };

export default function Leads() {
  const { data, reload } = useApi<L[]>("/api/admin/leads");
  return (
    <>
      <PageHeader title="Interessenten" lead="Nur aus zulässigen Quellen (Website-Anfrage, Demo, Empfehlung, Partner). Kein Kaltversand. Die Rechtsgrundlage steht bei jedem Eintrag." />
      <Card>{!data?.length ? <Empty>Noch keine Interessenten.</Empty> : <Table head={["Firma", "Kontakt", "Gewerk / Größe", "Quelle", "Fit", "Status", "Nächster Schritt"]}>{data.map((l) => <tr key={l.id}><td className="py-2 pr-3"><div className="font-medium">{l.company}</div><div className="max-w-xs truncate text-xs text-muted">{l.notes}</div></td><td className="py-2 pr-3 text-xs">{l.contact_name}<br />{l.email}</td><td className="py-2 pr-3 text-xs">{l.trade} / {l.size}</td><td className="py-2 pr-3 text-xs">{l.source}<br /><span className="text-muted">{l.consent_basis}</span></td><td className="py-2 pr-3">{l.fit_score != null ? <Badge tone={l.fit_score >= 60 ? "ok" : "neutral"}>{l.fit_score}</Badge> : "–"}<div className="text-xs text-muted">{l.fit_reasons?.join(", ")}</div></td><td className="py-2 pr-3"><select className={inputCls} value={l.status} onChange={async (e) => { await api(`/api/admin/leads/${l.id}`, { method: "PATCH", json: { status: e.target.value } }); reload(); }}>{["new", "qualified", "demo_scheduled", "trial", "customer", "lost"].map((s) => <option key={s}>{s}</option>)}</select></td><td className="py-2 text-xs">{l.next_action}<br /><span className="text-muted">{fmtDay(l.next_action_at)}</span></td></tr>)}</Table>}</Card>
    </>
  );
}
