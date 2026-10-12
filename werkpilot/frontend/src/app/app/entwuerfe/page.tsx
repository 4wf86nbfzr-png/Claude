"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Card, Empty, PageHeader } from "@/components/ui";
import { api, ApiError, fmtDate } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type D = { id: string; kind: string; subject: string; body: string; review_flags: string[]; proposed_slots: { label: string }[]; created_at: string; inquiry: { id: string; subject: string; sender_name: string; sender_email: string | null; priority: string } | null };

export default function Entwuerfe() {
  const { data, loading, reload } = useApi<D[]>("/api/drafts?status=pending");
  const [msg, setMsg] = useState<string | null>(null);
  async function act(id: string, action: "approve" | "reject") {
    try { await api(`/api/drafts/${id}/${action}`, { method: "POST", json: {} }); setMsg(action === "approve" ? "Gesendet." : "Verworfen."); reload(); }
    catch (ex) { setMsg(ex instanceof ApiError ? String(ex.detail) : "Fehler"); }
  }
  return (
    <>
      <PageHeader title="Entwürfe zur Freigabe" lead="Jede Antwort geht erst raus, wenn Sie sie freigeben. Zum Bearbeiten in die Anfrage wechseln." />
      {msg && <div className="mb-4"><Alert>{msg}</Alert></div>}
      {loading ? <p className="text-sm text-muted">Lade …</p> : !data?.length ? <Empty>Keine offenen Entwürfe.</Empty> : (
        <div className="space-y-4">
          {data.map((d) => (
            <Card key={d.id} title={<span>{d.inquiry ? <Link className="text-accent" href={`/app/anfragen/${d.inquiry.id}`}>{d.inquiry.subject || "(ohne Betreff)"}</Link> : "Anfrage"} <span className="font-normal text-muted">· {d.inquiry?.sender_name || d.inquiry?.sender_email} · {fmtDate(d.created_at)}</span></span>} action={<Badge>{d.kind}</Badge>}>
              {d.review_flags.length > 0 && <div className="mb-3"><Alert tone="warn">{d.review_flags.join(" · ")}</Alert></div>}
              <div className="text-sm font-medium">{d.subject}</div>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm text-ink-2">{d.body}</pre>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => act(d.id, "approve")} disabled={!d.inquiry?.sender_email}>Freigeben & senden</Button>
                <Button variant="secondary" href={d.inquiry ? `/app/anfragen/${d.inquiry.id}` : "/app/anfragen"}>Bearbeiten</Button>
                <Button variant="danger" onClick={() => act(d.id, "reject")}>Verwerfen</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
