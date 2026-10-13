#!/usr/bin/env python3
"""Legt einen Beispielbetrieb mit realistischen Anfragen, Terminen und Angeboten an (nur über die API).

Aufruf:  python3 scripts/demo_seed.py http://127.0.0.1:18000 /pfad/zum/api.log
Gibt E-Mail und Passwort des Kontos aus; damit kann man sich anmelden oder Bildschirme aufnehmen
(frontend/tools/screens/capture.mjs). Mit LLM_PROVIDER=mock sind die Entwürfe regelbasiert.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

B, LOG = sys.argv[1].rstrip("/"), sys.argv[2]


def call(method, path, body=None, headers=None, expect=200):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(B + path, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload, status = r.read().decode(), r.status
    except urllib.error.HTTPError as e:
        payload, status = e.read().decode(), e.code
    assert status == expect, f"{method} {path} → {status} {payload[:300]}"
    return json.loads(payload) if payload else {}


email, pw = f"demo-{int(time.time())}@elektro-brandt-beispiel.de", "Elbe-Kran-Moewe-33"
call("POST", "/api/auth/register", {"email": email, "password": pw, "full_name": "Jan Brandt", "company": "Elektro Brandt", "trade": "elektro", "accept_terms": True, "accept_privacy": True}, expect=201)
token = None
for _ in range(40):
    time.sleep(0.5)
    lines = [l for l in open(LOG, encoding="utf-8", errors="ignore").read().split("\n") if email in l and "bestaetigen?token=" in l]
    if lines:
        token = re.search(r"bestaetigen\?token=([A-Za-z0-9_\-]+)", lines[-1]).group(1)
        break
assert token, "kein Bestätigungslink im API-Log"
call("POST", "/api/auth/verify-email", {"token": token})
tok = call("POST", "/api/auth/login", {"email": email, "password": pw})["access_token"]
H = {"Authorization": f"Bearer {tok}"}

INQ = [
    ("Stromausfall im Erdgeschoss", "Guten Morgen, seit heute früh haben wir im Erdgeschoss keinen Strom mehr, die Sicherung fliegt sofort wieder raus. Wir haben ein Kleinkind und der Kühlschrank steht. Können Sie heute vorbeikommen? Lindenallee 14, 22299 Hamburg, 0171 2233445", "Familie Petersen", "petersen@kunde-beispiel.de"),
    ("Angebot Zählerschrank erneuern", "Hallo, unser Zählerschrank ist von 1978 und soll für eine Wärmepumpe erneuert werden. Können Sie uns ein Angebot machen? Fotos schicke ich gern. Mit freundlichen Grüßen, Sabine Krüger, Am Deich 3, 21029 Hamburg", "Sabine Krüger", "krueger@kunde-beispiel.de"),
    ("Wallbox Installation", "Wir haben ein neues E-Auto und möchten eine Wallbox in der Garage installieren lassen. Was wäre ein möglicher Termin für eine Besichtigung? Danke, Tom Albrecht, 0160 9988776", "Tom Albrecht", "albrecht@kunde-beispiel.de"),
    ("Steckdose im Bad funktioniert nicht", "Moin, die Steckdose im Bad ist seit gestern tot, FI ist aber drin. Vielleicht defekt? Birkenweg 7, 22089 Hamburg", "Meike Lorenz", "lorenz@kunde-beispiel.de"),
    ("Jährliche Prüfung Büro", "Sehr geehrte Damen und Herren, für unsere Büroräume steht die jährliche Prüfung der ortsveränderlichen Geräte an (ca. 60 Geräte). Bitte um Terminvorschlag im nächsten Monat. Hansen Steuerberatung, Osterstraße 110, 20259 Hamburg, 040 5551234", "Hansen Steuerberatung", "buero@hansen-beispiel.de"),
    ("Lampen im Treppenhaus", "Hallo, in unserem Mehrfamilienhaus sollen die Treppenhauslampen auf LED mit Bewegungsmelder umgerüstet werden, 4 Etagen. Bitte Angebot. Hausverwaltung Nord, 040 6667788", "Hausverwaltung Nord", "info@hv-nord-beispiel.de"),
    ("Unzufrieden mit Rechnung", "Guten Tag, ich bin mit der letzten Rechnung nicht einverstanden, es wurden zwei Stunden mehr berechnet als vor Ort gearbeitet wurde. Bitte um Rückruf. R. Schmidt, 0176 1112233", "R. Schmidt", "schmidt@kunde-beispiel.de"),
]
ids = []
for subject, body, name, mail in INQ:
    r = call("POST", "/api/inquiries", {"subject": subject, "body": body, "sender_name": name, "sender_email": mail}, headers=H, expect=201)
    ids.append(r["id"])
    time.sleep(0.2)

# Erste Anfrage (Notfall): Entwurf freigeben → Antwort gesendet
detail = call("GET", f"/api/inquiries/{ids[0]}", headers=H)
if detail.get("drafts"):
    call("POST", f"/api/drafts/{detail['drafts'][0]['id']}/approve", {}, headers=H)

now = datetime.now(timezone.utc)
def at(days, hour):
    d = (now + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return d.isoformat()

# Termine (Feature ab Business; in der Testphase enthalten)
try:
    call("POST", "/api/appointments", {"title": "Stromausfall Petersen, Lindenallee 14", "starts_at": at(0, 14), "ends_at": at(0, 16), "inquiry_id": ids[0], "location": "Lindenallee 14, 22299 Hamburg"}, headers=H, expect=201)
    call("POST", "/api/appointments", {"title": "Besichtigung Wallbox Albrecht", "starts_at": at(2, 9), "ends_at": at(2, 10), "inquiry_id": ids[2], "location": "Garage, Adresse folgt"}, headers=H, expect=201)
    call("POST", "/api/appointments", {"title": "Prüfung ortsveränderliche Geräte, Hansen", "starts_at": at(9, 8), "ends_at": at(9, 12), "inquiry_id": ids[4], "location": "Osterstraße 110"}, headers=H, expect=201)
except AssertionError as e:
    print("Termine übersprungen:", e)

# Angebote
call("POST", "/api/quotes", {"title": "Zählerschrank erneuern, Krüger", "inquiry_id": ids[1], "amount_cents": 289000, "sent_at": (now - timedelta(days=6)).isoformat(), "notes": "Inkl. Anmeldung beim Netzbetreiber"}, headers=H, expect=201)
call("POST", "/api/quotes", {"title": "Treppenhaus LED mit Bewegungsmelder, HV Nord", "inquiry_id": ids[5], "amount_cents": 164000, "sent_at": (now - timedelta(days=2)).isoformat()}, headers=H, expect=201)

call("POST", "/api/tenant/reports/weekly", headers=H)  # ein Wochenbericht, damit die Berichtsseite nicht leer ist
print(json.dumps({"email": email, "password": pw, "inquiry_ids": ids}))
