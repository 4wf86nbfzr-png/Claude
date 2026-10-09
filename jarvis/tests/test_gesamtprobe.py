"""Gesamtprobe: der echte Dienst mit allen vier Aussenschnittstellen gleichzeitig.

Das ist der Durchlauf, der dem Alltag am naechsten kommt: Telegram, CalDAV,
IMAP/SMTP und Twilio sind gleichzeitig angebunden (als Stellvertreter-Server,
die ihre Protokolle wirklich sprechen), der Hintergrunddienst laeuft, der
HTTP-Dienst steht. Geprueft wird, dass die Teile *zusammen* arbeiten und auf
denselben Datenbestand schauen.

Es wird niemand angerufen, es wird nichts versendet, es geht nichts nach
draussen.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import urllib.parse
import urllib.request
from datetime import timedelta

import pytest

from jarvis.adapters.telegram import TelegramBot
from jarvis.ai.cloud import EchoProvider
from jarvis.ai.provider import ModelReply, ToolInvocation
from jarvis.config import Settings
from jarvis.core.services import Services
from jarvis.db.database import utcnow
from jarvis.server.http_server import JarvisHTTPServer
from tests.stub_caldav import CalDavStub
from tests.stub_mail import ImapStub, SmtpStub, build_message
from tests.stub_telegram import TelegramStub
from tests.stub_twilio import TwilioStub

TOKEN = "999:gesamtprobe-token-xxxxxxxxxxxxxxxx"
TWILIO_TOKEN = "twtoken"
OEFFENTLICH = "http://127.0.0.1:8866"


@pytest.fixture
def welt(monkeypatch):
    """Alle vier Aussenschnittstellen plus die passende Konfiguration."""
    telegram = TelegramStub(port=8861, token=TOKEN)
    twilio = TwilioStub(port=8862, account_sid="ACprobe", auth_token=TWILIO_TOKEN)
    imap = ImapStub(port=8863, user="ich@example.org", password="geheim")
    smtp = SmtpStub(port=8864, user="ich@example.org", password="geheim")
    caldav = CalDavStub(port=8865, user="ich", password="geheim")
    for server in (telegram, twilio, imap, smtp, caldav):
        server.start()

    einstellungen = {
        "AI_PROVIDER": "echo",
        "TELEGRAM_BOT_TOKEN": TOKEN, "TELEGRAM_ALLOWED_IDS": "4711",
        "TELEGRAM_API_BASE": telegram.base_url, "TELEGRAM_POLL_TIMEOUT": "1",
        "PHONE_ENABLED": "true", "TWILIO_ACCOUNT_SID": "ACprobe",
        "TWILIO_AUTH_TOKEN": TWILIO_TOKEN, "TWILIO_FROM_NUMBER": "+4940123456",
        "PHONE_MY_NUMBER": "+4915112345678", "TWILIO_API_BASE": twilio.base_url,
        "PUBLIC_BASE_URL": OEFFENTLICH,
        "EMAIL_ENABLED": "true", "IMAP_HOST": "127.0.0.1", "IMAP_PORT": str(imap.port),
        "IMAP_USER": "ich@example.org", "IMAP_PASSWORD": "geheim", "IMAP_SSL": "false",
        "SMTP_HOST": "127.0.0.1", "SMTP_PORT": str(smtp.port), "SMTP_STARTTLS": "false",
        "EMAIL_IMPORTANT_SENDERS": "alex@example.org",
        "CALENDAR_PROVIDER": "caldav", "CALDAV_URL": caldav.base_url,
        "CALDAV_USER": "ich", "CALDAV_PASSWORD": "geheim",
        "HTTP_ENABLED": "true", "HTTP_HOST": "127.0.0.1", "HTTP_PORT": "8866",
        "HTTP_API_TOKEN": "probetoken", "SCHEDULER_TICK_SECONDS": "5",
        "QUIET_HOURS_START": "", "QUIET_HOURS_END": "", "MORNING_BRIEFING": "",
    }
    for name, wert in einstellungen.items():
        monkeypatch.setenv(name, wert)

    yield telegram, twilio, imap, smtp, caldav

    for server in (telegram, twilio, imap, smtp, caldav):
        server.stop()


def modell(dienste, *antworten):
    anbieter = EchoProvider(scripted=list(antworten))
    dienste.models.primary = anbieter
    dienste.models.active = anbieter
    dienste.models.fallback = None
    return anbieter


async def warte_auf(bedingung, grenze: float = 6.0) -> bool:
    for _ in range(int(grenze / 0.05)):
        await asyncio.sleep(0.05)
        if bedingung():
            return True
    return False


async def api_abruf(pfad: str) -> dict:
    """Im Thread abrufen -- ein blockierender Aufruf wuerde die Schleife anhalten,
    auf die der HTTP-Dienst seine Arbeit schiebt."""
    anfrage = urllib.request.Request(
        f"{OEFFENTLICH}{pfad}", headers={"Authorization": "Bearer probetoken"}
    )

    def hole() -> dict:
        with urllib.request.urlopen(anfrage, timeout=20) as antwort:
            return json.loads(antwort.read())

    return await asyncio.to_thread(hole)


async def telefon_rueckruf(pfad: str, felder: dict[str, str]) -> str:
    nutzlast = f"{OEFFENTLICH}{pfad}" + "".join(f"{k}{felder[k]}" for k in sorted(felder))
    signatur = base64.b64encode(
        hmac.new(TWILIO_TOKEN.encode(), nutzlast.encode(), hashlib.sha1).digest()
    ).decode()
    anfrage = urllib.request.Request(
        f"{OEFFENTLICH}{pfad}", data=urllib.parse.urlencode(felder).encode(), method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded",
                 "X-Twilio-Signature": signatur},
    )

    def rufe() -> str:
        with urllib.request.urlopen(anfrage, timeout=20) as antwort:
            return antwort.read().decode()

    return await asyncio.to_thread(rufe)


def test_alle_teile_arbeiten_zusammen(welt):
    telegram, twilio, imap, smtp, caldav = welt
    imap.add(build_message(
        from_addr="Alex Krapp <alex@example.org>", to_addr="ich@example.org",
        subject="Personalplanung November", body="Moin, Dienstag zwei Leute?",
    ))

    async def ablauf() -> None:
        einstellungen = Settings.load()
        # Nichts Offenes: alle vier Schnittstellen sind konfiguriert.
        assert einstellungen.missing_setup() == []

        dienste = Services(einstellungen)
        bot = TelegramBot(dienste)
        server = JarvisHTTPServer(dienste, asyncio.get_running_loop())
        bot_aufgabe = None
        try:
            # --- Startpruefung: alles erreichbar ---------------------------
            zustand = {z.name: z for z in await dienste.health()}
            assert dienste.calendar.name == "caldav"
            assert dienste.email is not None and dienste.phone_active
            for name in ("Datenbank", "KI-Modell", "Telegram", "Kalender (caldav)",
                         "E-Mail", "Telefonie"):
                assert zustand[name].ok, f"{name}: {zustand[name].detail}"

            await dienste.start()
            server.start()
            bot_aufgabe = asyncio.create_task(bot.start())
            assert await warte_auf(lambda: bool(telegram.texts()))

            # --- 1) Telegram -> Kalender ------------------------------------
            modell(
                dienste,
                ModelReply(text="", tool_calls=[ToolInvocation(
                    name="termin_anlegen",
                    arguments={"titel": "Begehung Objekt Nord",
                               "beginn": "2026-11-12T14:00", "dauer_minuten": 60})]),
                ModelReply(text="Termin steht im Kalender."),
            )
            telegram.push_message("Trag mir die Begehung am 12.11. um 14 Uhr ein")
            assert await warte_auf(
                lambda: any("Kalender" in t for t in telegram.texts())
            ), "Keine Antwort in Telegram"
            assert len(caldav.items) == 1, "Der Termin liegt nicht auf dem CalDAV-Server"
            assert "Begehung Objekt Nord" in next(iter(caldav.items.values()))

            # --- 2) Postfach -> proaktive Meldung ---------------------------
            bericht = await dienste._job_check_email(type("J", (), {"payload": {}})())
            assert "1 gemeldet" in bericht, bericht
            assert any("Personalplanung November" in t for t in telegram.texts())

            # --- 3) Faellige Erinnerung -> echter Anruf ---------------------
            dienste.reminders.create(
                "Wochenplanung", utcnow() - timedelta(minutes=1), channel="telefon"
            )
            await dienste._sweep_reminders()
            await dienste.scheduler.tick()      # Erinnerung -> Anruf-Auftrag
            await dienste.scheduler.tick()      # Anruf-Auftrag ausfuehren
            assert twilio.calls, "Es wurde kein Anruf abgesetzt"
            assert twilio.calls[0]["To"] == "+4915112345678"
            assert "Wochenplanung" in twilio.last_twiml()

            # --- 4) Dashboard sieht denselben Stand -------------------------
            status = await api_abruf("/api/status")
            assert status["kalender"] == "caldav"
            assert status["email_verbunden"] is True
            assert status["telefonie_aktiv"] is True
            assert status["einrichtung_offen"] == []
            termine = await api_abruf("/api/termine?tage=60")
            assert any(t["titel"] == "Begehung Objekt Nord" for t in termine), termine

            # --- 5) Telefongespraech ueber den echten Webhook ---------------
            modell(dienste, ModelReply(text="Heute steht die Begehung an."))
            twiml = await telefon_rueckruf("/telefon/gespraech", {
                "CallSid": "CAprobe", "SpeechResult": "Was steht heute an?"})
            assert "Begehung" in twiml
            assert "<Gather" in twiml, "Das Gespraech wurde nicht fortgesetzt"

            # --- 6) E-Mail-Antwort: Entwurf, Bestaetigung, Versand ----------
            entwurf = await dienste.toolkit.execute(
                "email_antwort_entwerfen", {"uid": "1", "inhalt": "Dienstag passt."})
            assert entwurf.ok, entwurf.text
            anfrage = await dienste.toolkit.execute(
                "email_senden", {"entwurf": entwurf.data["id"]}, chat_id="4711")
            assert anfrage.confirmation_token
            assert smtp.received == [], "Ohne Bestaetigung versendet"
            ergebnis = await dienste.build_agent().confirm(
                anfrage.confirmation_token, chat_id="4711")
            assert "Versendet" in ergebnis.text, ergebnis.text
            assert smtp.received[0][1] == ["alex@example.org"]

            # --- 7) Dasselbe Gedaechtnis fuer alle Wege ---------------------
            # Telefon und Telegram haben beide in denselben Bestand geschrieben.
            assert dienste.memory.message_count("telefon:CAprobe") == 2
            assert dienste.memory.message_count("4711") >= 2
            ereignisse = {e["kind"] for e in dienste.memory.recent_events(limit=50)}
            for erwartet in ("termin_angelegt", "anruf_gestartet", "email_versendet",
                             "erinnerung_ausgeloest"):
                assert erwartet in ereignisse, f"{erwartet} fehlt im Ereignisgedaechtnis"
        finally:
            await bot.stop()
            if bot_aufgabe is not None:
                bot_aufgabe.cancel()
                try:
                    await bot_aufgabe
                except asyncio.CancelledError:
                    pass
            server.stop()
            await dienste.stop()

    asyncio.run(ablauf())
