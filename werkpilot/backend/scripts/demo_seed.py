"""Legt einen Beispielbetrieb mit realistischen Anfragen, Terminen, Angeboten und Wochenbericht an.

Läuft im API-Container (oder lokal mit gesetzter DATABASE_URL):
    docker compose exec api python scripts/demo_seed.py
Registrierung und alle Daten gehen über die normale API; nur die Mail-Bestätigung wird direkt in der
Datenbank gesetzt, weil im Testbetrieb keine Mails verschickt werden. Gibt Zugangsdaten als JSON aus.
Optional: API_URL (Standard http://127.0.0.1:8000), DEMO_EMAIL, DEMO_PASSWORD.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.db import get_sessionmaker, utcnow
from app.models.core import User

B = os.environ.get("API_URL", "http://127.0.0.1:8000").rstrip("/")


def call(method, path, body=None, headers=None, expect=200):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(B + path, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload, status = r.read().decode(), r.status
    except urllib.error.HTTPError as e:
        payload, status = e.read().decode(), e.code
    if status != expect:
        raise SystemExit(f"{method} {path} → {status} {payload[:300]}")
    return json.loads(payload) if payload else {}


async def mark_verified(email: str) -> None:
    async with get_sessionmaker()() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if not user:
            raise SystemExit(f"Nutzer {email} nicht gefunden")
        user.email_verified_at = user.email_verified_at or utcnow()
        await db.commit()


INQ = [
    (
        "Stromausfall im Erdgeschoss",
        "Guten Morgen, seit heute früh haben wir im Erdgeschoss keinen Strom mehr, die Sicherung fliegt sofort wieder raus. Wir haben ein Kleinkind und der Kühlschrank steht. Können Sie heute vorbeikommen? Lindenallee 14, 22299 Hamburg, 0171 2233445",
        "Familie Petersen",
        "petersen@kunde-beispiel.de",
    ),
    (
        "Angebot Zählerschrank erneuern",
        "Hallo, unser Zählerschrank ist von 1978 und soll für eine Wärmepumpe erneuert werden. Können Sie uns ein Angebot machen? Fotos schicke ich gern. Mit freundlichen Grüßen, Sabine Krüger, Am Deich 3, 21029 Hamburg",
        "Sabine Krüger",
        "krueger@kunde-beispiel.de",
    ),
    (
        "Wallbox Installation",
        "Wir haben ein neues E-Auto und möchten eine Wallbox in der Garage installieren lassen. Was wäre ein möglicher Termin für eine Besichtigung? Danke, Tom Albrecht, 0160 9988776",
        "Tom Albrecht",
        "albrecht@kunde-beispiel.de",
    ),
    (
        "Steckdose im Bad funktioniert nicht",
        "Moin, die Steckdose im Bad ist seit gestern tot, FI ist aber drin. Vielleicht defekt? Birkenweg 7, 22089 Hamburg",
        "Meike Lorenz",
        "lorenz@kunde-beispiel.de",
    ),
    (
        "Jährliche Prüfung Büro",
        "Sehr geehrte Damen und Herren, für unsere Büroräume steht die jährliche Prüfung der ortsveränderlichen Geräte an (ca. 60 Geräte). Bitte um Terminvorschlag im nächsten Monat. Hansen Steuerberatung, Osterstraße 110, 20259 Hamburg, 040 5551234",
        "Hansen Steuerberatung",
        "buero@hansen-beispiel.de",
    ),
    (
        "Lampen im Treppenhaus",
        "Hallo, in unserem Mehrfamilienhaus sollen die Treppenhauslampen auf LED mit Bewegungsmelder umgerüstet werden, 4 Etagen. Bitte Angebot. Hausverwaltung Nord, 040 6667788",
        "Hausverwaltung Nord",
        "info@hv-nord-beispiel.de",
    ),
    (
        "Unzufrieden mit Rechnung",
        "Guten Tag, ich bin mit der letzten Rechnung nicht einverstanden, es wurden zwei Stunden mehr berechnet als vor Ort gearbeitet wurde. Bitte um Rückruf. R. Schmidt, 0176 1112233",
        "R. Schmidt",
        "schmidt@kunde-beispiel.de",
    ),
]


def main() -> None:
    email = os.environ.get("DEMO_EMAIL") or f"demo-{int(time.time())}@elektro-brandt-beispiel.de"
    pw = os.environ.get("DEMO_PASSWORD", "Elbe-Kran-Moewe-33")
    call(
        "POST",
        "/api/auth/register",
        {"email": email, "password": pw, "full_name": "Jan Brandt", "company": "Elektro Brandt", "trade": "elektro", "accept_terms": True, "accept_privacy": True},
        expect=201,
    )
    asyncio.run(mark_verified(email))
    tok = call("POST", "/api/auth/login", {"email": email, "password": pw})["access_token"]
    H = {"Authorization": f"Bearer {tok}"}
    ids = []
    for subject, body, name, mail in INQ:
        ids.append(call("POST", "/api/inquiries", {"subject": subject, "body": body, "sender_name": name, "sender_email": mail}, headers=H, expect=201)["id"])
    detail = call("GET", f"/api/inquiries/{ids[0]}", headers=H)
    if detail.get("drafts"):
        call("POST", f"/api/drafts/{detail['drafts'][0]['id']}/approve", {}, headers=H)
    now = datetime.now(UTC)

    def at(days, hour):
        return (now + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()

    for title, d, h0, h1, inq, loc in [
        ("Stromausfall Petersen, Lindenallee 14", 0, 14, 16, ids[0], "Lindenallee 14, 22299 Hamburg"),
        ("Besichtigung Wallbox Albrecht", 2, 9, 10, ids[2], "Garage, Adresse folgt"),
        ("Prüfung ortsveränderliche Geräte, Hansen", 9, 8, 12, ids[4], "Osterstraße 110"),
    ]:
        call("POST", "/api/appointments", {"title": title, "starts_at": at(d, h0), "ends_at": at(d, h1), "inquiry_id": inq, "location": loc}, headers=H, expect=201)
    call(
        "POST",
        "/api/quotes",
        {
            "title": "Zählerschrank erneuern, Krüger",
            "inquiry_id": ids[1],
            "amount_cents": 289000,
            "sent_at": (now - timedelta(days=6)).isoformat(),
            "notes": "Inkl. Anmeldung beim Netzbetreiber",
        },
        headers=H,
        expect=201,
    )
    call(
        "POST",
        "/api/quotes",
        {"title": "Treppenhaus LED mit Bewegungsmelder, HV Nord", "inquiry_id": ids[5], "amount_cents": 164000, "sent_at": (now - timedelta(days=2)).isoformat()},
        headers=H,
        expect=201,
    )
    call("POST", "/api/tenant/reports/weekly", headers=H)
    print(json.dumps({"email": email, "password": pw, "inquiries": len(ids)}))


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        print("Fehler:", e, file=sys.stderr)
        raise
