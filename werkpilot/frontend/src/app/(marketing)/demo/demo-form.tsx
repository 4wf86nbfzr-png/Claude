"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, Field, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

const examples = [
  "Guten Tag, seit heute früh ist bei uns die Heizung komplett aus und es kommt kein Warmwasser mehr. Wir haben zwei kleine Kinder. Können Sie heute noch kommen? Familie Schulz, Tel. 0170 1234567",
  "Hallo, wir möchten unser Wohnzimmer (ca. 28 qm) und den Flur streichen lassen. Können Sie uns ein Angebot machen? Gerne mit Besichtigungstermin.",
  "Nach dem Sturm gestern fehlen mehrere Ziegel und im Dachboden ist es feucht. Birkenweg 12, 22089 Hamburg.",
];

type Result = { classification: { category: string; priority: string; confidence: number; summary: string; missing_info: string[]; needs_human: boolean }; draft: { subject: string; body: string }; note: string };

export function DemoForm() {
  const [text, setText] = useState(examples[0]);
  const [trade, setTrade] = useState("shk");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      setRes(await api<Result>("/api/public/demo/classify", { method: "POST", json: { text, trade } }));
    } catch (ex) {
      setErr(ex instanceof ApiError ? String(ex.detail) : "Fehler");
    } finally {
      setBusy(false);
    }
  }
  const tone = { urgent: "bad", high: "warn", normal: "accent", low: "neutral" } as const;
  return (
    <div className="mt-8 space-y-6">
      <form onSubmit={run} className="space-y-4">
        <Field label="Gewerk">
          <select className={inputCls} value={trade} onChange={(e) => setTrade(e.target.value)}>
            <option value="shk">Sanitär / Heizung</option><option value="elektro">Elektro</option><option value="maler">Maler</option><option value="dach">Dachdecker</option>
          </select>
        </Field>
        <Field label="Kundenanfrage">
          <textarea className={`${inputCls} min-h-36`} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} required />
        </Field>
        <div className="flex flex-wrap gap-2">
          {examples.map((ex, i) => <button type="button" key={i} onClick={() => setText(ex)} className="rounded-full border border-line bg-paper px-3 py-1 text-xs text-ink-2 hover:bg-sand-2">Beispiel {i + 1}</button>)}
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Wird verarbeitet …" : "Anfrage verarbeiten"}</Button>
      </form>
      {err && <Alert tone="bad">{err}</Alert>}
      {res && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Einordnung">
            <div className="flex flex-wrap gap-2"><Badge tone="accent">{res.classification.category}</Badge><Badge tone={tone[res.classification.priority as keyof typeof tone] ?? "neutral"}>Priorität: {res.classification.priority}</Badge>{res.classification.needs_human && <Badge tone="warn">Mensch prüfen</Badge>}</div>
            <p className="mt-3 text-sm text-ink-2">{res.classification.summary}</p>
            {res.classification.missing_info.length > 0 && (<><h3 className="mt-4 text-sm font-semibold">Fehlt noch</h3><ul className="mt-1 list-disc pl-5 text-sm text-ink-2">{res.classification.missing_info.map((m) => <li key={m}>{m}</li>)}</ul></>)}
          </Card>
          <Card title="Antwortentwurf">
            <div className="text-sm font-medium">{res.draft.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-2">{res.draft.body}</pre>
          </Card>
          <div className="md:col-span-2"><Alert>{res.note}</Alert></div>
        </div>
      )}
    </div>
  );
}
