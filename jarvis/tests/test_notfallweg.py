"""Ohne Sprachmodell: eindeutige Auftraege muessen trotzdem ausgefuehrt werden.

Der Anlass ist ein echter Fehlschlag beim ersten Betriebstag: "Erinnere mich
in 2 Minuten daran, Wasser zu trinken" wurde bei abgeschaltetem Ollama nur
hoeflich beantwortet -- angelegt wurde nichts.
"""

from __future__ import annotations

import asyncio
from zoneinfo import ZoneInfo

import pytest

from jarvis.ai.cloud import EchoProvider
from jarvis.core.offline import erkenne
from jarvis.db.database import utcnow
from jarvis.errors import ModelUnavailable

TZ = ZoneInfo("Europe/Berlin")


def run(coroutine):
    return asyncio.run(coroutine)


def ohne_modell(services):
    class Stumm(EchoProvider):
        async def chat(self, messages, **kwargs):
            raise ModelUnavailable("Ollama laeuft nicht")

    services.models.primary = Stumm()
    services.models.fallback = None
    services.settings.ai_max_retries = 0


# --- Erkennung ---------------------------------------------------------------
@pytest.mark.parametrize("satz,werkzeug,inhalt", [
    ("Erinnere mich in 2 Minuten daran, Wasser zu trinken",
     "erinnerung_anlegen", "Wasser zu trinken"),
    ("Erinnere mich morgen um 8:30 an den Rückruf bei Alex",
     "erinnerung_anlegen", "Rückruf bei Alex"),
    ("Jarvis, erinnere mich jeden Montag um 9 Uhr an die Wochenplanung",
     "erinnerung_anlegen", "Wochenplanung"),
    ("Merk dir: Telefonate lieber vormittags",
     "gedaechtnis_merken", "Telefonate lieber vormittags"),
    ("Leg eine Aufgabe an: Dienstplan für nächste Woche",
     "aufgabe_anlegen", "Dienstplan für nächste Woche"),
    ("Ich muss die Rechnung an Objekt Nord schreiben",
     "aufgabe_anlegen", "die Rechnung an Objekt Nord schreiben"),
])
def test_eindeutige_auftraege_werden_erkannt(satz, werkzeug, inhalt):
    auftrag = erkenne(satz, TZ)
    assert auftrag is not None, satz
    assert auftrag.werkzeug == werkzeug
    werte = " ".join(str(v) for v in auftrag.argumente.values())
    assert inhalt in werte


@pytest.mark.parametrize("satz", [
    "Moin, wie läuft es?",
    "Was steht heute an?",
    "Wer ist eigentlich für Objekt Nord zuständig?",
    "Danke dir",
    "/aufgaben",
])
def test_gespraech_wird_nicht_als_auftrag_missdeutet(satz):
    """Lieber nichts tun, als etwas Falsches anlegen."""
    assert erkenne(satz, TZ) is None


def test_erinnerung_ohne_zeit_fragt_nach():
    auftrag = erkenne("Erinnere mich an den Zahnarzt", TZ)
    assert auftrag is not None
    assert auftrag.werkzeug == ""
    assert "Wann" in auftrag.rueckfrage


def test_wiederholung_und_anrufwunsch_werden_mitgenommen():
    auftrag = erkenne("Ruf mich jeden Montag um 9 an und erinnere mich an die Planung",
                      TZ, telefonie=True)
    assert auftrag.argumente["wiederholung"] == "woechentlich:mo"
    assert auftrag.argumente["kanal"] == "telefon"

    # Ohne eingeschaltete Telefonie wird daraus eine Telegram-Erinnerung --
    # aber nicht stillschweigend.
    ohne = erkenne("Ruf mich morgen um 9 an", TZ, telefonie=False)
    assert ohne.argumente["kanal"] == "telegram"
    assert "Telefonie ist aus" in ohne.hinweis


def test_aufgabe_mit_faelligkeit():
    auftrag = erkenne("Ich muss morgen die Rechnung schreiben", TZ)
    assert auftrag.werkzeug == "aufgabe_anlegen"
    assert auftrag.argumente["faellig"] == "morgen"


# --- Im Agenten --------------------------------------------------------------
def test_erinnerung_wird_ohne_modell_wirklich_angelegt(services):
    """Der Fall aus dem Betrieb: freier Text, Modell aus."""
    ohne_modell(services)
    antwort = run(services.build_agent().handle(
        "42", "Erinnere mich in 2 Minuten daran, Wasser zu trinken"))

    erinnerungen = services.reminders.upcoming()
    assert len(erinnerungen) == 1, "Keine Erinnerung angelegt"
    assert erinnerungen[0].text == "Wasser zu trinken"
    assert erinnerungen[0].due_at > utcnow()
    assert "Erinnerung #1" in antwort.text
    # Und Jarvis sagt dazu, dass das Modell fehlt -- keine stille Luege.
    assert "nicht erreichbar" in antwort.text
    assert antwort.degraded


def test_aufgabe_wird_ohne_modell_angelegt(services):
    ohne_modell(services)
    antwort = run(services.build_agent().handle(
        "42", "Ich muss den Dienstplan für nächste Woche machen"))
    aufgaben = services.tasks.list()
    assert len(aufgaben) == 1
    assert "Dienstplan" in aufgaben[0].title
    assert "angelegt" in antwort.text


def test_gedaechtnis_ohne_modell(services):
    ohne_modell(services)
    run(services.build_agent().handle("42", "Merk dir: Telefonate lieber vormittags"))
    assert services.memory.search_memory("Telefonate")


def test_plauderei_bekommt_eine_ehrliche_antwort(services):
    ohne_modell(services)
    antwort = run(services.build_agent().handle("42", "Moin, wie läuft es?"))
    assert antwort.degraded
    assert "antwortet gerade nicht" in antwort.text
    # Der Hinweis nennt, was trotzdem geht.
    assert "erinnere mich" in antwort.text.lower()
    assert services.reminders.upcoming() == [] and services.tasks.list() == []


def test_fehlende_zeit_fuehrt_zur_rueckfrage_statt_zur_stille(services):
    ohne_modell(services)
    antwort = run(services.build_agent().handle("42", "Erinnere mich an den Zahnarzt"))
    assert "Wann" in antwort.text
    assert services.reminders.upcoming() == []


def test_mit_modell_bleibt_alles_beim_alten(services):
    """Der Notfallweg darf nur greifen, wenn das Modell wirklich weg ist."""
    from jarvis.ai.provider import ModelReply, ToolInvocation
    anbieter = EchoProvider(scripted=[
        ModelReply(text="", tool_calls=[ToolInvocation(
            name="erinnerung_anlegen",
            arguments={"text": "Wasser trinken", "wann": "in 2 minuten"})]),
        ModelReply(text="Steht."),
    ])
    services.models.primary = anbieter
    services.models.active = anbieter
    services.models.fallback = None

    antwort = run(services.build_agent().handle(
        "42", "Erinnere mich in 2 Minuten daran, Wasser zu trinken"))
    assert antwort.text == "Steht."
    assert not antwort.degraded
    assert len(services.reminders.upcoming()) == 1
