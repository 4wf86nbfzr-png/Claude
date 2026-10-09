"""Zusammenspiel: Hintergrunddienst, Neustart, E-Mail-Freigabe, Telefonie.

Keine externen Aufrufe: E-Mail und Twilio werden durch Doppelgaenger
ersetzt, die festhalten, ob sie *tatsaechlich* benutzt wurden.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

from jarvis.db.database import iso, utcnow
from jarvis.errors import ExternalServiceError


def run(coroutine):
    return asyncio.run(coroutine)


class MailDoppel:
    """Zaehlt Versandversuche, verschickt nie etwas."""

    def __init__(self, scheitern: bool = False) -> None:
        self.versendet: list[tuple[str, str, str]] = []
        self.scheitern = scheitern
        self.from_addr = "info@example.org"

    async def send(self, to_addr, subject, body, *, in_reply_to="", cc=""):
        if self.scheitern:
            raise ExternalServiceError("Der Mailserver hat abgelehnt.")
        self.versendet.append((to_addr, subject, body))
        return "<nachricht@example.org>"

    async def fetch_unread(self, limit=10, with_body=False):
        return []

    async def fetch_one(self, uid):
        return None

    async def health(self):
        return True, "Doppelgaenger"


class TelefonDoppel:
    def __init__(self) -> None:
        self.anrufe: list[str] = []
        self.public_base_url = "https://example.org"

    async def call_reminder(self, text, *, reminder_id=None, to_number=""):
        self.anrufe.append(text)

        class Ergebnis:
            sid = "CA123"
            status = "queued"
            to_number = "+4915112345678"
            log_id = 1
        return Ergebnis()

    async def call_conversation(self, opening="", *, to_number=""):
        return await self.call_reminder(opening)

    def recent_calls(self, limit=10):
        return []

    def note_result(self, sid, status, *, transcript=""):
        return None

    async def health(self):
        return True, "Doppelgaenger"

    async def close(self):
        return None


# --- Hintergrunddienst --------------------------------------------------------
def test_faellige_erinnerung_wird_ausgeloest_und_zugestellt(services):
    gesendet: list[str] = []

    async def sender(text, keyboard=None):
        gesendet.append(text)
        return True

    services.notifier.set_sender(sender)
    services.notifier.quiet_start = services.notifier.quiet_end = ""
    reminder = services.reminders.create("Alex anrufen", utcnow() - timedelta(minutes=1))

    async def ablauf():
        await services.scheduler.tick()          # Wachdienst ist noch nicht eingeplant
        await services._sweep_reminders()        # faellige Erinnerung -> Auftrag
        await services.scheduler.tick()          # Auftrag ausfuehren

    run(ablauf())
    assert any("Alex anrufen" in text for text in gesendet)
    assert services.reminders.get(reminder.id).status in {"ausgeloest", "bestaetigt"}


def test_erinnerung_wird_nicht_doppelt_ausgeloest(services):
    gesendet: list[str] = []

    async def sender(text, keyboard=None):
        gesendet.append(text)
        return True

    services.notifier.set_sender(sender)
    services.notifier.quiet_start = services.notifier.quiet_end = ""
    services.reminders.create("Nur einmal", utcnow() - timedelta(minutes=1))

    async def ablauf():
        for _ in range(3):
            await services._sweep_reminders()
            await services.scheduler.tick()

    run(ablauf())
    assert len([t for t in gesendet if "Nur einmal" in t]) == 1


def test_geplante_erinnerungen_ueberleben_einen_neustart(settings):
    from jarvis.core.services import Services

    erster = Services(settings)
    reminder = erster.reminders.create("Nach dem Neustart", utcnow() + timedelta(hours=3))
    erster.queue.enqueue("sicherung", run_at=utcnow() + timedelta(hours=1),
                                   idempotency_key="test-sicherung")
    run(erster.stop())

    zweiter = Services(settings)
    try:
        wieder = zweiter.reminders.get(reminder.id)
        assert wieder is not None
        assert wieder.text == "Nach dem Neustart"
        assert wieder.status == "geplant"
        assert any(j.kind == "sicherung" for j in zweiter.queue.pending())
    finally:
        run(zweiter.stop())


def test_laufender_auftrag_wird_nach_absturz_wieder_aufgenommen(services):
    services.queue.enqueue("sicherung", idempotency_key="abbruch")
    job = services.queue.claim_due()[0]
    services.db.execute(
        "UPDATE job SET locked_at = ? WHERE id = ?", ("2020-01-01T00:00:00Z", job.id)
    )
    assert services.queue.recover_stuck(older_than_minutes=1) == 1
    assert services.queue.get(job.id).status == "geplant"


def test_wachdienst_meldet_ueberfaellige_aufgabe(services):
    gesendet: list[str] = []

    async def sender(text, keyboard=None):
        gesendet.append(text)
        return True

    services.notifier.set_sender(sender)
    services.notifier.quiet_start = services.notifier.quiet_end = ""
    services.tasks.create("Laengst faellig", due_at=utcnow() - timedelta(hours=2))
    run(services._sweep_overdue_tasks())
    assert any("ueberfaellig" in text.lower() for text in gesendet)
    # Kein zweites Mal fuer dieselbe Aufgabe.
    gesendet.clear()
    run(services._sweep_overdue_tasks())
    assert gesendet == []


def test_sicherung_als_auftrag(services):
    run(services._job_backup(type("J", (), {"payload": {}})()))
    assert list(services.settings.backup_dir.glob("jarvis-*.sqlite3"))
    assert services.store.get("letzte_sicherung")


# --- E-Mail ------------------------------------------------------------------
def test_email_wird_erst_nach_bestaetigung_versendet(services):
    services.email = MailDoppel()
    entwurf = services.db.insert("draft", {
        "kind": "email", "to_addr": "alex@example.org", "subject": "Personalplanung",
        "body": "Moin Alex, passt Dienstag?", "status": "entwurf",
        "created_at": iso(utcnow()), "updated_at": iso(utcnow()),
    })

    anfrage = run(services.toolkit.execute("email_senden", {"entwurf": entwurf}, chat_id="42"))
    assert anfrage.confirmation_token
    assert services.email.versendet == []          # noch nichts raus

    ergebnis = run(services.build_agent().confirm(anfrage.confirmation_token, chat_id="42"))
    assert "Versendet" in ergebnis.text
    assert services.email.versendet[0][0] == "alex@example.org"
    assert services.db.query_one(
        "SELECT status FROM draft WHERE id = ?", (entwurf,))["status"] == "gesendet"


def test_email_wird_nicht_zweimal_versendet(services):
    services.email = MailDoppel()
    entwurf = services.db.insert("draft", {
        "kind": "email", "to_addr": "alex@example.org", "subject": "Test", "body": "Text",
        "status": "entwurf", "created_at": iso(utcnow()), "updated_at": iso(utcnow()),
    })
    anfrage = run(services.toolkit.execute("email_senden", {"entwurf": entwurf}, chat_id="42"))
    run(services.build_agent().confirm(anfrage.confirmation_token))
    # Ein zweiter Anlauf mit neuem Token darf nichts erneut senden.
    zweite = run(services.toolkit.execute("email_senden", {"entwurf": entwurf}, chat_id="42"))
    assert not zweite.ok or zweite.confirmation_token == ""
    assert len(services.email.versendet) == 1


def test_fehlgeschlagener_versand_wird_ehrlich_gemeldet(services):
    services.email = MailDoppel(scheitern=True)
    entwurf = services.db.insert("draft", {
        "kind": "email", "to_addr": "alex@example.org", "subject": "Test", "body": "Text",
        "status": "entwurf", "created_at": iso(utcnow()), "updated_at": iso(utcnow()),
    })
    anfrage = run(services.toolkit.execute("email_senden", {"entwurf": entwurf}, chat_id="42"))
    ergebnis = run(services.build_agent().confirm(anfrage.confirmation_token))
    assert "fehlgeschlagen" in ergebnis.text.lower()
    assert services.db.query_one(
        "SELECT status FROM draft WHERE id = ?", (entwurf,))["status"] == "entwurf"


def test_ohne_postfach_kommt_ein_hinweis_statt_eines_absturzes(services):
    services.email = None
    ergebnis = run(services.toolkit.execute("email_ungelesen", {}))
    assert not ergebnis.ok
    assert "nicht verbunden" in ergebnis.text


# --- Telefonie ---------------------------------------------------------------
def test_ohne_telefonie_wird_nicht_angerufen(services):
    services.phone = None
    ergebnis = run(services.toolkit.execute("anruf_jetzt", {"text": "Hallo"}, chat_id="42"))
    assert not ergebnis.ok
    assert "nicht aktiv" in ergebnis.text


def test_anruf_braucht_bestaetigung(services):
    services.phone = TelefonDoppel()
    services.store.set("telefonie", "true")

    anfrage = run(services.toolkit.execute(
        "anruf_jetzt", {"text": "Erinnerung an die Planung"}, chat_id="42"
    ))
    assert anfrage.confirmation_token
    assert services.phone.anrufe == []

    ergebnis = run(services.build_agent().confirm(anfrage.confirmation_token))
    assert "klingelt" in ergebnis.text.lower()
    assert services.phone.anrufe == ["Erinnerung an die Planung"]


def test_abgeschaltete_telefonie_verhindert_den_auftrag(services):
    services.phone = TelefonDoppel()
    services.store.set("telefonie", "false")
    ergebnis = run(services._job_call(type("J", (), {
        "payload": {"text": "Test", "versuch": 1}})()))
    assert "abgeschaltet" in ergebnis
    assert services.phone.anrufe == []


def test_anrufversuche_sind_begrenzt(services):
    services.phone = TelefonDoppel()
    services.store.set("telefonie", "true")
    services.settings.phone_max_attempts = 2
    ergebnis = run(services._job_call(type("J", (), {
        "payload": {"text": "Test", "versuch": 5}})()))
    assert "Maximale Anrufversuche" in ergebnis
    assert services.phone.anrufe == []


def test_telefonische_erinnerung_loest_anruf_aus(services):
    services.phone = TelefonDoppel()
    services.store.set("telefonie", "true")
    services.reminders.create(
        "Wochenplanung", utcnow() - timedelta(minutes=1), channel="telefon"
    )

    async def ablauf():
        await services._sweep_reminders()
        await services.scheduler.tick()      # Erinnerung -> Anruf-Auftrag
        await services.scheduler.tick()      # Anruf-Auftrag ausfuehren

    run(ablauf())
    assert services.phone.anrufe == ["Wochenplanung"]


# --- Tagesueberblick ---------------------------------------------------------
def test_tagesueberblick_nutzt_echte_daten(services):
    from jarvis.adapters.calendar.base import CalendarEvent
    services.tasks.create("Angebot schreiben", priority="hoch")
    beginn = utcnow() + timedelta(minutes=10)
    run(services.calendar.create_event(CalendarEvent(
        uid="", title="Teambesprechung", start=beginn, end=beginn + timedelta(hours=1))))

    # Ueberblick fuer den Tag des Termins -- sonst haengt der Test an der Uhrzeit,
    # zu der er laeuft (kurz vor Mitternacht faellt "+3 Stunden" auf morgen).
    ueberblick = run(services.daily_overview(beginn))
    assert "Teambesprechung" in ueberblick
    assert "Angebot schreiben" in ueberblick


def test_status_bleibt_auch_ohne_netz_abrufbar(services):
    zustand = services.status_snapshot()
    assert "modell" in zustand and "aufgaben" in zustand
    assert zustand["kalender"] == "local"
