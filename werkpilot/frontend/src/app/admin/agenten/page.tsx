"use client";

import { useState } from "react";
import { Badge, Card, PageHeader, inputCls } from "@/components/ui";
import { fmtDate } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type R = { id: string; agent: string; status: string; trigger: string; started_at: string; finished_at: string | null; summary: string; findings: string[]; actions: string[]; cost_cents: number; error: string | null };

export default function Agenten() {
  const [agent, setAgent] = useState("");
  const { data } = useApi<R[]>(`/api/admin/agent-runs?limit=50${agent ? `&agent=${agent}` : ""}`);
  return (
    <>
      <PageHeader title="Agentenläufe" lead="Jeder Lauf mit Befunden, Aktionen, Kosten und Fehlern. Agenten: ops (Betrieb), director (Leitung), product_dev, support, marketing, sales, finance." action={<select className={inputCls} value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">Alle</option>{["ops", "director", "product_dev", "support", "marketing", "sales", "finance"].map((a) => <option key={a}>{a}</option>)}</select>} />
      <div className="space-y-3">{data?.map((r) => <Card key={r.id} title={<span>{r.agent} <Badge tone={r.status === "ok" ? "ok" : r.status === "failed" ? "bad" : "neutral"}>{r.status}</Badge></span>} action={<span className="text-xs text-muted">{fmtDate(r.started_at)} · {r.trigger} · {r.cost_cents} ct</span>}><p className="text-sm">{r.summary}</p>{r.findings.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-ink-2">{r.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>}{r.actions.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-accent">{r.actions.map((f, i) => <li key={i}>{f}</li>)}</ul>}{r.error && <pre className="mt-2 whitespace-pre-wrap text-xs text-bad">{r.error}</pre>}</Card>)}</div>
    </>
  );
}
