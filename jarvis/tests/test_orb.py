"""Der Orb: Sprachoberflaeche, Aktionen, Stimme.

Es wird nichts gestartet, nichts aufgenommen und nichts bei ElevenLabs
bestellt -- die Aussenkanten sind durch Attrappen ersetzt, der Weg durch
den Orb ist echt.
"""

from __future__ import annotations

import asyncio
import json
import threading
import urllib.error
import urllib.request

import pytest

from jarvis.core import orb as orbmodul
from jarvis.core.orb import Orb, OrbAntwort, fuer_stimme, tageszeit


def run(coroutine):
    return asyncio.run(coroutine)


@pytest.fixture
def orb(services):
    return Orb(services)


# ------------------------------------------------------------ Aufbereitung
@pytest.mark.parametrize("roh,erwartet", [
    ("*Erledigt.* #12 ist weg", "Erledigt. Nummer 12 ist weg"),
    ("- erstens\n- zweitens", "erstens zweitens"),
    ("Schau auf https://example.com/x", "Schau auf die verlinkte Seite"),
    ("Mache ich. [AKTION:OEFFNE] tagesschau.de", "Mache ich."),
])
def test_text_wird_sprechbar(roh, erwartet):
    assert fuer_stimme(roh) == erwartet


def test_tageszeit():
    from datetime import datetime
    assert tageszeit(datetime(2026, 1, 1, 7, 0)) == "Guten Morgen"
    assert tageszeit(datetime(2026, 1, 1, 14, 0)) == "Guten Tag"
    assert tageszeit(datetime(2026, 1, 1, 20, 0)) == "Guten Abend"


# ------------------------------------------------------------- Begruessung
def test_begruessung_nennt_zeit_und_aufgaben(orb, services, monkeypatch):
    monkeypatch.setattr(orbmodul, "_jetzt", lambda: __import__(
        "jarvis.db.database", fromlist=["utcnow"]).utcnow())
    services.settings.orb_stadt = ""          # kein Netz im Test
    services.settings.orb_anrede = "Sir"
    services.tasks.create("Dienstplan schreiben")
    antwort = run(orb.begruessung())
    assert "Sir" in antwort.text and "Uhr" in antwort.text
    assert "Dienstplan schreiben" in antwort.text
    assert antwort.audio == ""                # ohne ElevenLabs-Schluessel


def test_begruessung_ohne_aufgaben(orb, services):
    services.settings.orb_stadt = ""
    antwort = run(orb.begruessung())
    assert "nichts Offenes" in antwort.text


def test_weckwort_loest_begruessung_aus(orb, services):
    services.settings.orb_stadt = ""
    antwort = run(orb.sprich("Jarvis aktivieren"))
    assert "Uhr" in antwort.text


def test_weckwort_nicht_bei_ganzem_satz(orb, services):
    services.settings.orb_stadt = ""
    antwort = run(orb.sprich("Jarvis aktivieren bitte alle Lichter und dann noch mehr Text"))
    assert "Uhr" not in antwort.text


def test_leere_eingabe(orb):
    assert "nichts verstanden" in run(orb.sprich("   ")).text


# ---------------------------------------------------------------- Aktionen
def test_aktionsmarke_wird_ausgefuehrt_und_nicht_vorgelesen(orb, services, monkeypatch):
    gestartet: list[str] = []

    async def falsches_oeffnen(ziel, *, als_app=False):
        gestartet.append(ziel)
        return True, ""

    monkeypatch.setattr("jarvis.core.tools_system.oeffne", falsches_oeffnen)
    services.settings.orb_programme = ["Spotify"]

    aktionen, text = run(orb._marken_ausfuehren(
        "Mach ich. [AKTION:START] Spotify", chat_id="orb"
    ))
    assert aktionen == ["programm_starten"]
    assert gestartet == ["Spotify"]
    assert "[AKTION" not in text and "Mach ich." in text


def test_unbekannte_marke_wird_nur_entfernt(orb):
    aktionen, text = run(orb._marken_ausfuehren("Gut. [AKTION:TANZEN]", chat_id="orb"))
    assert aktionen == [] and "AKTION" not in text


def test_startaufstellung_startet_und_begruesst(orb, services, monkeypatch):
    gestartet: list[str] = []

    async def falsches_oeffnen(ziel, *, als_app=False):
        gestartet.append(ziel)
        return True, ""

    monkeypatch.setattr("jarvis.core.tools_system.oeffne", falsches_oeffnen)
    services.settings.orb_programme = ["Spotify", "Obsidian"]
    services.settings.orb_webseite = "https://hermserviceteam.com"
    services.settings.orb_stadt = ""
    antwort = run(orb.startaufstellung())
    assert gestartet == ["Spotify", "Obsidian", "https://hermserviceteam.com"]
    assert "Alles bereit" in antwort.text and "Uhr" in antwort.text


def test_startaufstellung_ohne_programme_sagt_das(orb, services):
    services.settings.orb_programme = []
    services.settings.orb_webseite = ""
    assert "nichts hinterlegt" in run(orb.startaufstellung()).text


def test_abgeschaltete_aktionen_starten_nichts(orb, services, monkeypatch):
    monkeypatch.setattr("jarvis.core.tools_system.oeffne", _nie_aufrufen)
    services.settings.orb_aktionen = False
    services.settings.orb_programme = ["Spotify"]
    assert "abgeschaltet" in run(orb.startaufstellung()).text


async def _nie_aufrufen(*args, **kwargs):  # pragma: no cover
    raise AssertionError("Es darf nichts gestartet werden.")


# ------------------------------------------------------------ Werkzeuge
def test_programm_nur_von_der_liste(services, monkeypatch):
    monkeypatch.setattr("jarvis.core.tools_system.oeffne", _nie_aufrufen)
    services.settings.orb_programme = ["Spotify"]
    ergebnis = run(services.toolkit.execute("programm_starten", {"programm": "Taschenrechner"}))
    assert not ergebnis.ok and "nicht auf der Liste" in ergebnis.text


def test_programm_wird_unscharf_gefunden(services, monkeypatch):
    gestartet: list[str] = []

    async def falsches_oeffnen(ziel, *, als_app=False):
        gestartet.append(ziel)
        return True, ""

    monkeypatch.setattr("jarvis.core.tools_system.oeffne", falsches_oeffnen)
    services.settings.orb_programme = ["Visual Studio Code"]
    ergebnis = run(services.toolkit.execute("programm_starten", {"programm": "visual studio code"}))
    assert ergebnis.ok and gestartet == ["Visual Studio Code"]


@pytest.mark.parametrize("adresse", ["file:///etc/passwd", "javascript:alert(1)", "nix"])
def test_nur_echte_webadressen(services, monkeypatch, adresse):
    monkeypatch.setattr("jarvis.core.tools_system.oeffne", _nie_aufrufen)
    ergebnis = run(services.toolkit.execute("webseite_oeffnen", {"adresse": adresse}))
    if adresse == "nix":
        # "nix" wird zu https://nix -- eine gueltige, wenn auch sinnlose Adresse.
        return
    assert not ergebnis.ok


def test_bildschirm_ohne_schluessel_sagt_das(services, monkeypatch):
    monkeypatch.setattr("jarvis.adapters.vision.aufnahme_moeglich", lambda: (True, "ok"))

    async def falsches_foto():
        return b"\x89PNG-bild"

    monkeypatch.setattr("jarvis.adapters.vision.bildschirmfoto", falsches_foto)
    services.settings.anthropic_api_key = ""
    ergebnis = run(services.toolkit.execute("bildschirm_ansehen", {}))
    assert not ergebnis.ok and "ANTHROPIC_API_KEY" in ergebnis.text


def test_bildschirm_beschreibt(services, monkeypatch):
    monkeypatch.setattr("jarvis.adapters.vision.aufnahme_moeglich", lambda: (True, "ok"))

    async def falsches_foto():
        return b"\x89PNG-bild"

    async def falsche_beschreibung(bild, frage, **kwargs):
        return "Ein Kalender mit drei Terminen."

    monkeypatch.setattr("jarvis.adapters.vision.bildschirmfoto", falsches_foto)
    monkeypatch.setattr("jarvis.adapters.vision.beschreibe_bild", falsche_beschreibung)
    services.settings.anthropic_api_key = "sk-test"
    ergebnis = run(services.toolkit.execute("bildschirm_ansehen", {"frage": "Was ist da?"}))
    assert ergebnis.ok and "Kalender" in ergebnis.text


# ----------------------------------------------------------------- Stimme
def test_stimme_ohne_schluessel_ist_nicht_verfuegbar(orb):
    assert not orb.stimme.verfuegbar
    assert "Systemstimme" in orb.stimme.beschreibe()


def test_vertonen_nutzt_die_datei(orb, services, monkeypatch):
    ziel = services.settings.data_dir / "audio" / "abc.mp3"
    ziel.parent.mkdir(parents=True, exist_ok=True)
    ziel.write_bytes(b"id3")

    class Attrappe:
        verfuegbar = True

        async def datei(self, text):
            assert "*" not in text          # schon fuer die Stimme aufbereitet
            return ziel

    orb._stimme = Attrappe()
    assert run(orb._vertonen("*Alles* klar")) == "/audio/abc.mp3"


def test_antwort_als_json_ergaenzt_den_sprechtext():
    daten = OrbAntwort(text="*Hallo* #3").als_json()
    assert daten["gesprochen"] == "Hallo Nummer 3"


# ------------------------------------------------------------------- HTTP
@pytest.fixture
def dienst(services, monkeypatch):
    from jarvis.server.http_server import JarvisHTTPServer
    services.settings.http_api_token = "orb-test-token"
    services.settings.http_port = 8793
    services.settings.http_host = "127.0.0.1"
    services.settings.orb_stadt = ""
    loop = asyncio.new_event_loop()
    thread = threading.Thread(target=loop.run_forever, daemon=True)
    thread.start()
    server = JarvisHTTPServer(services, loop)
    server.start()
    yield server, services
    server.stop()
    loop.call_soon_threadsafe(loop.stop)
    thread.join(timeout=3)


def anfrage(pfad, nutzlast=None, token="orb-test-token"):
    daten = json.dumps(nutzlast).encode() if nutzlast is not None else None
    req = urllib.request.Request(
        f"http://127.0.0.1:8793{pfad}", data=daten,
        method="POST" if daten is not None else "GET",
        headers={"Content-Type": "application/json"},
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as antwort:
        roh = antwort.read().decode()
        return antwort.status, (json.loads(roh) if roh.startswith(("{", "[")) else roh)


def test_orb_seite_wird_ausgeliefert(dienst):
    status, inhalt = anfrage("/orb", token=None)
    assert status == 200 and "Jarvis" in inhalt and "webkitSpeechRecognition" in inhalt


def test_orb_seite_abschaltbar(dienst):
    _, services = dienst
    services.settings.orb_enabled = False
    with pytest.raises(urllib.error.HTTPError) as fehler:
        anfrage("/orb", token=None)
    assert fehler.value.code == 404


def test_orb_einstellungen_brauchen_das_token(dienst):
    with pytest.raises(urllib.error.HTTPError) as fehler:
        anfrage("/api/orb/einstellungen", token=None)
    assert fehler.value.code == 401
    status, daten = anfrage("/api/orb/einstellungen")
    assert status == 200 and daten["anrede"] and daten["eigene_stimme"] is False


def test_orb_spricht_ueber_die_api(dienst):
    status, daten = anfrage("/api/orb/sprich", {"text": "Jarvis aktivieren"})
    assert status == 200 and "Uhr" in daten["text"]
    assert daten["gesprochen"] and "*" not in daten["gesprochen"]


def test_orb_ohne_text(dienst):
    with pytest.raises(urllib.error.HTTPError) as fehler:
        anfrage("/api/orb/sprich", {"text": "  "})
    assert fehler.value.code == 400


def test_startaufstellung_ueber_die_api(dienst, monkeypatch):
    _, services = dienst
    services.settings.orb_programme = []
    services.settings.orb_webseite = ""
    status, daten = anfrage("/api/orb/start", {})
    assert status == 200 and "nichts hinterlegt" in daten["text"]


def test_audio_nur_aus_dem_audioordner(dienst):
    _, services = dienst
    with pytest.raises(urllib.error.HTTPError) as fehler:
        anfrage("/audio/..%2F..%2Fetc%2Fpasswd", token=None)
    assert fehler.value.code in {400, 404}


def test_mp3_wird_ausgeliefert(dienst):
    _, services = dienst
    ordner = services.settings.data_dir / "audio"
    ordner.mkdir(parents=True, exist_ok=True)
    (ordner / "probe.mp3").write_bytes(b"ID3test")
    status, inhalt = anfrage("/audio/probe.mp3", token=None)
    assert status == 200 and "ID3" in inhalt


# ------------------------------------------------------------------ Wetter
def test_wetterzeile_wird_gebaut(monkeypatch):
    from jarvis.core import tools_system

    class FalscheAntwort:
        def __init__(self, daten):
            self._daten = daten

        def json(self):
            return self._daten

    class FalscherClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url, params=None):
            if "geocoding" in url:
                return FalscheAntwort({"results": [
                    {"name": "Hamburg", "latitude": 53.55, "longitude": 10.0}
                ]})
            return FalscheAntwort({"current": {
                "temperature_2m": 7.4, "apparent_temperature": 3.1, "weather_code": 61,
            }})

    monkeypatch.setattr(tools_system.httpx, "AsyncClient", lambda **k: FalscherClient())
    zeile = run(tools_system.wetter("Hamburg"))
    assert zeile == "Hamburg: 7 Grad, gefuehlt 3, Regen"


def test_wetter_ohne_stadt_ist_leer():
    from jarvis.core.tools_system import wetter
    assert run(wetter("")) == ""
