"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, Field, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

/** Beispiele je Gewerk: ein dringender Fall, eine Angebotsanfrage, ein unklarer Fall. Alle Angaben sind frei erfunden. */
const EXAMPLES: Record<string, { label: string; text: string }[]> = {
  shk: [
    { label: "Heizung aus", text: "Guten Tag, seit heute früh ist bei uns die Heizung komplett aus und es kommt kein Warmwasser mehr. Wir haben zwei kleine Kinder. Können Sie heute noch kommen? Familie Beispiel, Musterweg 4, 20144 Hamburg, Tel. 040 0000000" },
    { label: "Bad-Angebot", text: "Hallo, wir möchten unser Bad (ca. 7 qm) komplett sanieren lassen: neue Dusche statt Wanne, Waschtisch, Fliesen. Können Sie uns ein Angebot machen? Gerne mit Besichtigung." },
    { label: "Unklar", text: "Hallo, mein Nachbar meinte, Sie hätten damals bei ihm was gemacht. Ich hätte da auch mal eine Frage zu meiner Anlage, rufen Sie mich doch einfach zurück." },
  ],
  elektro: [
    { label: "Stromausfall", text: "Bei uns fliegt seit gestern Abend ständig die Sicherung raus, jetzt ist die halbe Wohnung ohne Strom und es riecht leicht verschmort am Sicherungskasten. Bitte dringend melden! Musterstraße 12, 22089 Hamburg, 0170 0000000" },
    { label: "Wallbox-Angebot", text: "Wir hätten gern ein Angebot für eine Wallbox (11 kW) in der Garage, Zählerschrank ist im Keller, ca. 15 m Leitungsweg. Was würde das kosten und wann hätten Sie Zeit?" },
    { label: "Unklar", text: "Moin, wegen der Sache von letzter Woche: Passt es bei Ihnen eher vormittags? Gruß Meier" },
  ],
  maler: [
    { label: "Wasserschaden", text: "Nach einem Rohrbruch ist die Wand im Flur durchnässt, Farbe blättert ab und es riecht muffig. Die Versicherung braucht schnell einen Kostenvoranschlag. Tel. 0151 0000000" },
    { label: "Wohnung streichen", text: "Hallo, wir möchten unser Wohnzimmer (ca. 28 qm) und den Flur streichen lassen. Können Sie uns ein Angebot machen? Gerne mit Besichtigungstermin." },
    { label: "Beschwerde", text: "Die Decke, die Sie letzte Woche gestrichen haben, hat jetzt Streifen und an zwei Stellen Tropfen. So kann das nicht bleiben, ich bin wirklich unzufrieden." },
  ],
  dach: [
    { label: "Sturmschaden", text: "Nach dem Sturm gestern fehlen mehrere Ziegel und im Dachboden ist es feucht. Es regnet weiter rein. Birkenweg 12, 22089 Hamburg, Tel. 040 0000000" },
    { label: "Dachfenster", text: "Wir überlegen, zwei Dachfenster einbauen zu lassen (Dachgeschoss, Satteldach, Baujahr 1968). Können Sie uns ein Angebot machen und sagen, ob dafür eine Genehmigung nötig ist?" },
    { label: "Wartung", text: "Guten Tag, wir hätten gern die jährliche Inspektion vom Flachdach unserer Lagerhalle. Wann passt es Ihnen?" },
  ],
};

const TRADES: [string, string][] = [["shk", "Sanitär / Heizung"], ["elektro", "Elektro"], ["maler", "Maler"], ["dach", "Dachdecker"]];
const CATEGORY: Record<string, string> = { notfall: "Notfall", reparatur: "Reparatur", angebot: "Angebotsanfrage", wartung: "Wartung", terminfrage: "Terminfrage", neuinstallation: "Neuinstallation", beschwerde: "Beschwerde", spam: "Spam", sonstiges: "Sonstiges" };
const PRIORITY: Record<string, string> = { urgent: "Dringend", high: "Hoch", normal: "Normal", low: "Niedrig" };

type Result = {
  classification: { category: string; priority: string; confidence: number; summary: string; missing_info: string[]; needs_human: boolean; needs_human_reason?: string | null };
  draft: { subject: string; body: string };
  note: string;
  engine?: string;
};

export function DemoForm() {
  const [trade, setTrade] = useState("shk");
  const [text, setText] = useState(EXAMPLES.shk[0].text);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickTrade(t: string) { setTrade(t); setText(EXAMPLES[t][0].text); setRes(null); }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      setRes(await api<Result>("/api/public/demo/classify", { method: "POST", json: { text, trade } }));
    } catch (ex) {
      if (ex instanceof ApiError && ex.status === 429) setErr("Zu viele Demo-Anfragen von Ihrer Verbindung. Bitte in einer Minute noch einmal.");
      else if (ex instanceof ApiError && ex.status === 422) setErr("Bitte mindestens zehn Zeichen eingeben.");
      else if (ex instanceof ApiError && ex.status === 503) setErr("Die Demo ist gerade nicht erreichbar. Bitte später noch einmal versuchen.");
      else setErr(ex instanceof ApiError ? String(ex.detail) : "Die Demo konnte nicht ausgeführt werden. Bitte später noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }
  const tone = { urgent: "bad", high: "warn", normal: "accent", low: "neutral" } as const;
  const c = res?.classification;
  return (
    <div className="mt-8 space-y-6">
      <form onSubmit={run} className="space-y-4" aria-describedby="demo-hinweis">
        <Field label="Gewerk">
          <select className={inputCls} value={trade} onChange={(e) => pickTrade(e.target.value)}>
            {TRADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Kundenanfrage">
          <textarea className={`${inputCls} min-h-36`} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} minLength={10} required />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Beispiele:</span>
          {EXAMPLES[trade].map((ex) => <button type="button" key={ex.label} onClick={() => { setText(ex.text); setRes(null); }} className="rounded-full border border-line bg-paper px-3 py-1 text-xs text-ink-2 hover:bg-sand-2">{ex.label}</button>)}
        </div>
        <p id="demo-hinweis" className="text-xs text-muted">Beispieldaten: Namen, Adressen und Telefonnummern sind frei erfunden. Die Demo arbeitet regelbasiert und speichert Ihren Text nicht.</p>
        <Button type="submit" disabled={busy}>{busy ? "Wird verarbeitet …" : "Anfrage verarbeiten"}</Button>
      </form>
      {err && <Alert tone="bad">{err}</Alert>}
      {res && c && (
        <div className="grid gap-4 md:grid-cols-2" aria-live="polite">
          <Card title="Einordnung">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{CATEGORY[c.category] ?? c.category}</Badge>
              <Badge tone={tone[c.priority as keyof typeof tone] ?? "neutral"}>Dringlichkeit: {PRIORITY[c.priority] ?? c.priority}</Badge>
              <Badge tone="neutral">Sicherheit {Math.round(c.confidence * 100)} %</Badge>
              {c.needs_human && <Badge tone="warn">Mensch prüfen</Badge>}
            </div>
            <p className="mt-3 text-sm text-ink-2">{c.summary}</p>
            {c.needs_human && <p className="mt-2 text-sm text-ink-2"><strong>Warum ein Mensch prüft:</strong> {c.needs_human_reason ?? "Unklare oder heikle Anfrage"}. In Clairify geht so ein Fall nie automatisch raus.</p>}
            {c.missing_info.length > 0 && (<><h3 className="mt-4 text-sm font-semibold">Fehlt noch</h3><ul className="mt-1 list-disc pl-5 text-sm text-ink-2">{c.missing_info.map((m) => <li key={m}>{m}</li>)}</ul></>)}
          </Card>
          <Card title="Antwortentwurf">
            <div className="text-sm font-medium">{res.draft.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-2">{res.draft.body}</pre>
          </Card>
          <div className="md:col-span-2"><Alert><span className="font-medium">Regelbasiert, keine KI:</span> {res.note}</Alert></div>
        </div>
      )}
    </div>
  );
}
