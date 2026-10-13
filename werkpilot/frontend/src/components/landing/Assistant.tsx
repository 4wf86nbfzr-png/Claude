"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "bot"; text: string; unsure?: boolean };

const VORSCHLAEGE = ["Was macht Clairify genau?", "Was kostet das im Monat?", "Wo liegen meine Daten?", "Wer steckt hinter Clairify?"];
const BEGRUESSUNG = "Moin! Ich beantworte kurze Fragen zu Clairify und zum Unternehmen dahinter. Was möchten Sie wissen?";

/** Kleiner Assistent unten links. Antworten kommen aus der Wissensliste des Servers (kurz, menschlich,
 *  nichts erfunden). Fragen werden nicht gespeichert. */
export function Assistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "bot", text: BEGRUESSUNG }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const toggleBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); toggleBtn.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setText("");
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const r = await fetch("/api/public/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      if (r.status === 429) { setMsgs((m) => [...m, { role: "bot", text: "Einen Moment bitte, das ging gerade etwas schnell. Versuchen Sie es gleich noch einmal." }]); return; }
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { answer: string; unsure: boolean };
      setMsgs((m) => [...m, { role: "bot", text: j.answer, unsure: j.unsure }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "Gerade komme ich nicht an meine Antworten. Schreiben Sie uns gern über das Kontaktformular." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="asst">
      <button ref={toggleBtn} type="button" className="asst-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="asst-panel" aria-label={open ? "Fragen schließen" : "Fragen an Clairify stellen"}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z" /><path d="M8.5 8.5h7M8.5 12h4.5" /></svg>
        <span className="asst-toggle-text">Fragen?</span>
      </button>
      {open && (
        <section id="asst-panel" className="asst-panel" role="dialog" aria-label="Fragen zu Clairify">
          <header className="asst-head">
            <div><div className="font-semibold">Fragen zu Clairify</div><div className="text-xs text-ink-2">Kurze Antworten, nichts wird gespeichert.</div></div>
            <button type="button" className="asst-close" onClick={() => { setOpen(false); toggleBtn.current?.focus(); }} aria-label="Schließen">×</button>
          </header>
          <div ref={log} className="asst-log" aria-live="polite">
            {msgs.map((m, i) => (
              <p key={i} className={`asst-msg ${m.role === "user" ? "is-user" : "is-bot"}`}>{m.text}</p>
            ))}
            {busy && <p className="asst-msg is-bot text-ink-2">Einen Moment …</p>}
          </div>
          {msgs.length === 1 && (
            <div className="asst-chips">
              {VORSCHLAEGE.map((v) => <button key={v} type="button" className="asst-chip" onClick={() => ask(v)}>{v}</button>)}
            </div>
          )}
          <form className="asst-form" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
            <label className="sr-only" htmlFor="asst-input">Ihre Frage</label>
            <input id="asst-input" ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Ihre Frage …" autoComplete="off" />
            <button type="submit" className="btn-primary" disabled={busy || !text.trim()}>Senden</button>
          </form>
          <p className="asst-note">Antworten entstehen automatisch aus unseren Website Inhalten und ersetzen keine Beratung.</p>
        </section>
      )}
    </div>
  );
}
