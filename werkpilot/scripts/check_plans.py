#!/usr/bin/env python3
"""Vergleicht die Tarifdaten des Frontends (frontend/src/lib/plans.ts) mit der API (GET /api/billing/plans).

Aufruf: python3 scripts/check_plans.py http://127.0.0.1:18000
Exit 1, wenn Preis, Anfragen/Monat, Nutzer oder Feature-Liste abweichen.
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

api = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
ts = (Path(__file__).resolve().parents[1] / "frontend/src/lib/plans.ts").read_text(encoding="utf-8")
blocks = re.findall(r"\{\s*code: \"(\w+)\",(.*?)\n  \},", ts, re.S)
front = {}
for code, body in blocks:
    g = lambda k: re.search(rf"{k}: ([^,\n]+)", body).group(1).strip()  # noqa: E731
    feats = re.search(r"features: \[(.*?)\]", body, re.S).group(1)
    front[code] = {
        "price_cents_monthly": int(g("priceCents")),
        "inquiries_per_month": int(g("inquiriesPerMonth")),
        "users": int(g("users")),
        "features": sorted(re.findall(r"\"(\w+)\"", feats)),
    }
with urllib.request.urlopen(api + "/api/billing/plans", timeout=10) as r:
    back = {p["code"]: p for p in json.load(r)}
bad = []
for code, f in front.items():
    b = back.get(code)
    if not b:
        bad.append(f"{code}: fehlt in der API")
        continue
    if b["price_cents_monthly"] != f["price_cents_monthly"]:
        bad.append(f"{code}: Preis API {b['price_cents_monthly']} ≠ Frontend {f['price_cents_monthly']}")
    for k in ("inquiries_per_month", "users"):
        if b["limits"].get(k) != f[k]:
            bad.append(f"{code}: {k} API {b['limits'].get(k)} ≠ Frontend {f[k]}")
    if sorted(b["features"]) != f["features"]:
        bad.append(f"{code}: Features API {sorted(b['features'])} ≠ Frontend {f['features']}")
for code in back:
    if code not in front:
        bad.append(f"{code}: nur in der API")
if bad:
    print("Tarifdaten weichen ab:\n  " + "\n  ".join(bad))
    sys.exit(1)
print(f"Tarifdaten stimmen überein ({', '.join(front)})")
