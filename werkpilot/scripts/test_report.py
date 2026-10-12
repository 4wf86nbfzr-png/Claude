"""Erzeugt den HTML-Bericht für test-all.sh.
Aufruf: test_report.py <ergebnisse.tsv> <logdatei> <ziel.html> <startzeit> <dauer_s> <commit> <argumente>"""

from __future__ import annotations

import html
import sys
from collections import OrderedDict
from pathlib import Path

results_path, log_path, out_path, started, duration, commit, args = sys.argv[1:8]
rows = [line.rstrip("\n").split("\t") for line in Path(results_path).read_text(encoding="utf-8").splitlines() if line.strip()]
sections: OrderedDict[str, list[list[str]]] = OrderedDict()
for status, section, name, t in rows:
    sections.setdefault(section, []).append([status, name, t])
total = len(rows)
failed = sum(1 for r in rows if r[0] != "OK")
passed = total - failed
log_text = Path(log_path).read_text(encoding="utf-8", errors="replace") if Path(log_path).exists() else ""
log_tail = log_text[-60000:]
ok_all = failed == 0
e = html.escape

sec_html = []
for section, items in sections.items():
    n_bad = sum(1 for i in items if i[0] != "OK")
    badge = f'<span class="pill bad">{n_bad} Fehler</span>' if n_bad else '<span class="pill ok">alle OK</span>'
    lis = "".join(
        f'<li class="{"bad" if st != "OK" else "ok"}"><span class="mark" aria-hidden="true">{"✗" if st != "OK" else "✓"}</span>'
        f'<span class="name">{e(name)}</span><span class="t">{e(t)} s</span></li>'
        for st, name, t in items
    )
    sec_html.append(f'<section class="sec"><h2>{e(section)} {badge}</h2><ul>{lis}</ul></section>')

doc = f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WerkPilot Testbericht</title>
<meta name="description" content="Ergebnis des vollständigen Testlaufs von WerkPilot AI (Backend, Frontend, Smoke-Test, Browser-Durchlauf).">
<style>
:root{{--bg:#f6f5f2;--paper:#fff;--ink:#16181d;--ink2:#3a3f4b;--muted:#6b7280;--line:#e5e7eb;--ok:#15803d;--oksoft:#e6f4ea;--bad:#b91c1c;--badsoft:#fdecec;--accent:#1d4ed8}}
:root:not([data-theme="light"]){{@media (prefers-color-scheme:dark){{--bg:#111318;--paper:#181b22;--ink:#f3f4f6;--ink2:#c9ccd3;--muted:#8b909b;--line:#2a2e37;--oksoft:#143321;--badsoft:#3b1717}}}}
:root[data-theme="dark"]{{--bg:#111318;--paper:#181b22;--ink:#f3f4f6;--ink2:#c9ccd3;--muted:#8b909b;--line:#2a2e37;--oksoft:#143321;--badsoft:#3b1717}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}}
main{{max-width:880px;margin:0 auto;padding:32px 16px 64px}}
h1{{font-size:1.7rem;margin:0 0 4px;letter-spacing:-.01em}}h2{{font-size:1.05rem;margin:0 0 10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}}
.lead{{color:var(--muted);margin:0 0 20px}}
.verdict{{border-radius:14px;padding:18px 20px;margin:0 0 20px;font-weight:600;font-size:1.1rem}}
.verdict.ok{{background:var(--oksoft);color:var(--ok)}}.verdict.bad{{background:var(--badsoft);color:var(--bad)}}
.stats{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 24px}}
.stat{{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:12px 14px}}
.stat .k{{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}}.stat .v{{font-size:1.5rem;font-weight:600}}
.sec{{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 12px}}
ul{{list-style:none;margin:0;padding:0}}li{{display:flex;gap:10px;align-items:baseline;padding:5px 0;border-top:1px solid var(--line)}}li:first-child{{border-top:0}}
.mark{{width:1.2em;font-weight:700}}li.ok .mark{{color:var(--ok)}}li.bad .mark{{color:var(--bad)}}li.bad .name{{color:var(--bad);font-weight:600}}
.name{{flex:1;min-width:0;overflow-wrap:anywhere}}.t{{color:var(--muted);font-variant-numeric:tabular-nums;font-size:.85rem}}
.pill{{font-size:.72rem;font-weight:600;border-radius:999px;padding:2px 9px}}.pill.ok{{background:var(--oksoft);color:var(--ok)}}.pill.bad{{background:var(--badsoft);color:var(--bad)}}
details{{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin-top:20px}}summary{{cursor:pointer;font-weight:600}}
pre{{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink2);max-height:60vh;overflow:auto;margin:10px 0 0}}
footer{{color:var(--muted);font-size:.85rem;margin-top:28px}}
</style>
</head>
<body>
<main>
<h1>WerkPilot AI – Testbericht</h1>
<p class="lead">Lauf vom {e(started)} · Commit {e(commit)} · Dauer {e(duration)} s{(" · Optionen: " + e(args)) if args.strip() else ""}</p>
<div class="verdict {"ok" if ok_all else "bad"}" role="status">{"Alle Prüfungen bestanden." if ok_all else f"{failed} von {total} Prüfungen fehlgeschlagen."}</div>
<div class="stats">
  <div class="stat"><div class="k">Prüfungen</div><div class="v">{total}</div></div>
  <div class="stat"><div class="k">Bestanden</div><div class="v">{passed}</div></div>
  <div class="stat"><div class="k">Fehlgeschlagen</div><div class="v">{failed}</div></div>
  <div class="stat"><div class="k">Abschnitte</div><div class="v">{len(sections)}</div></div>
</div>
{"".join(sec_html)}
<details><summary>Protokoll (letzte 60 kB aus .test-all.log)</summary><pre>{e(log_tail)}</pre></details>
<footer>Erzeugt von <code>test-all.sh</code>. Grün = bestanden, Rot = fehlgeschlagen. Bei Fehlern steht der Grund im Protokoll.</footer>
</main>
</body>
</html>
"""
Path(out_path).write_text(doc, encoding="utf-8")
