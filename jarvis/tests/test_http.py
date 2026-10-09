"""HTTP-Dienst: Zugangsschutz, API, Telefonie-Rueckrufe."""

from __future__ import annotations

import asyncio
import json
import threading
import urllib.error
import urllib.request

import pytest

from jarvis.server.http_server import JarvisHTTPServer, validate_twilio_signature


@pytest.fixture
def dienst(services, monkeypatch):
    """Startet den HTTP-Dienst mit einer eigenen Hauptschleife in einem Thread."""
    services.settings.http_api_token = "geheim-fuer-den-test"
    services.settings.http_port = 8791
    services.settings.http_host = "127.0.0.1"

    loop = asyncio.new_event_loop()
    thread = threading.Thread(target=loop.run_forever, daemon=True)
    thread.start()
    server = JarvisHTTPServer(services, loop)
    server.start()
    yield server, services
    server.stop()
    loop.call_soon_threadsafe(loop.stop)
    thread.join(timeout=3)


def hole(pfad: str, token: str | None = "geheim-fuer-den-test"):
    anfrage = urllib.request.Request(f"http://127.0.0.1:8791{pfad}")
    if token:
        anfrage.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(anfrage, timeout=10) as antwort:
        return antwort.status, json.loads(antwort.read().decode())


def sende(pfad: str, daten: dict, token: str | None = "geheim-fuer-den-test"):
    anfrage = urllib.request.Request(
        f"http://127.0.0.1:8791{pfad}",
        data=json.dumps(daten).encode(), method="POST",
        headers={"Content-Type": "application/json"},
    )
    if token:
        anfrage.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(anfrage, timeout=30) as antwort:
        return antwort.status, json.loads(antwort.read().decode())


def test_ohne_token_kein_zugriff(dienst):
    with pytest.raises(urllib.error.HTTPError) as fehler:
        hole("/api/aufgaben", token=None)
    assert fehler.value.code == 401


def test_falsches_token_kein_zugriff(dienst):
    with pytest.raises(urllib.error.HTTPError) as fehler:
        hole("/api/aufgaben", token="falsch")
    assert fehler.value.code == 401


def test_gesundheitspunkt_ist_offen(dienst):
    status, daten = hole("/gesundheit", token=None)
    assert status == 200 and daten["status"] == "ok"


def test_aufgaben_ueber_die_api(dienst):
    server, services = dienst
    services.tasks.create("Aus der API gelesen", priority="hoch")
    status, daten = hole("/api/aufgaben")
    assert status == 200
    assert daten[0]["titel"] == "Aus der API gelesen"
    assert daten[0]["prioritaet"] == 1


def test_aufgabe_anlegen_und_abschliessen_ueber_die_api(dienst):
    server, services = dienst
    status, daten = sende("/api/aufgabe", {"titel": "Per API angelegt"})
    assert status == 200
    aufgabe_id = daten["id"]
    assert services.tasks.get(aufgabe_id).title == "Per API angelegt"

    status, daten = sende("/api/aufgabe/erledigt", {"id": aufgabe_id})
    assert daten["status"] == "erledigt"


def test_dashboard_und_telegram_sehen_denselben_stand(dienst):
    server, services = dienst
    # Ueber die API angelegt ...
    status, daten = sende("/api/aufgabe", {"titel": "Gemeinsamer Stand"})
    # ... und im Kern (den Telegram benutzt) sofort sichtbar.
    assert any(t.title == "Gemeinsamer Stand" for t in services.tasks.list())


def test_status_enthaelt_komponenten(dienst):
    status, daten = hole("/api/status")
    assert status == 200
    assert "modell" in daten and "aufgaben" in daten
    assert isinstance(daten.get("komponenten"), list)
    assert any(k["name"] == "Datenbank" for k in daten["komponenten"])


def test_nachricht_geht_durch_denselben_agenten(dienst):
    server, services = dienst
    from jarvis.ai.cloud import EchoProvider
    from jarvis.ai.provider import ModelReply, ToolInvocation

    provider = EchoProvider(scripted=[
        ModelReply(text="", tool_calls=[ToolInvocation(
            name="aufgabe_anlegen", arguments={"titel": "Vom Dashboard"})]),
        ModelReply(text="Angelegt."),
    ])
    services.models.primary = provider
    services.models.active = provider
    services.models.fallback = None

    status, daten = sende("/api/nachricht", {"text": "Leg eine Aufgabe an"})
    assert status == 200
    assert daten["antwort"] == "Angelegt."
    assert "aufgabe_anlegen" in daten["werkzeuge"]
    assert any(t.title == "Vom Dashboard" for t in services.tasks.list())


def test_unbekannter_pfad(dienst):
    with pytest.raises(urllib.error.HTTPError) as fehler:
        hole("/api/gibtsnicht")
    assert fehler.value.code == 404


def test_telefonie_ohne_signatur_wird_abgewiesen(dienst):
    anfrage = urllib.request.Request(
        "http://127.0.0.1:8791/telefon/gespraech",
        data=b"CallSid=CA1&SpeechResult=Hallo", method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with pytest.raises(urllib.error.HTTPError) as fehler:
        urllib.request.urlopen(anfrage, timeout=10)
    assert fehler.value.code == 403


def test_twilio_signatur_wird_richtig_geprueft():
    token = "testtoken"
    url = "https://example.org/telefon/gespraech"
    felder = {"CallSid": "CA1", "SpeechResult": "Hallo Jarvis"}

    import base64
    import hashlib
    import hmac
    nutzlast = url + "".join(f"{k}{felder[k]}" for k in sorted(felder))
    richtig = base64.b64encode(
        hmac.new(token.encode(), nutzlast.encode(), hashlib.sha1).digest()
    ).decode()

    assert validate_twilio_signature(token, url, felder, richtig)
    assert not validate_twilio_signature(token, url, felder, "falsch")
    assert not validate_twilio_signature(token, url, {"CallSid": "CA2"}, richtig)
    assert not validate_twilio_signature("", url, felder, richtig)
