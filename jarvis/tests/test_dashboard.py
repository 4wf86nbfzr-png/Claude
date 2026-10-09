"""Tests des Dashboards gegen einen echten Testclient.

Wichtigster Punkt: das Dashboard rechnet nichts selbst. Es zeigt, was
Aufgabenmanager, Agent und Pipeline fuehren -- es kann also nicht behaupten,
eine Aufgabe sei fertig, wenn sie es nicht ist.
"""

import pytest

fastapi = pytest.importorskip("fastapi", reason="Dashboard braucht fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from jarvis.config import Config  # noqa: E402
from jarvis.llm.client import Chunk  # noqa: E402
from jarvis.permissions import Policy, Scope  # noqa: E402
from jarvis.runtime import JarvisRuntime  # noqa: E402
from jarvis.tasks.manager import Status  # noqa: E402


class ScriptedLLM:
    def __init__(self, antworten=None) -> None:
        self.antworten = list(antworten or ["Moin Noah."])
        self.gefragt: list[str] = []

    def chat(self, messages, *, tools=None, cancel=None):
        nutzer = [m for m in messages if m["role"] == "user"]
        if nutzer:
            self.gefragt.append(nutzer[-1]["content"])
        yield Chunk(text=self.antworten.pop(0) if self.antworten else "ok", done=True)

    def health(self):
        return True, "Testmodell bereit"

    def models(self):
        return ["testmodell"]


@pytest.fixture()
def client(tmp_path):
    from jarvis.dashboard.server import create_app

    cfg = Config()
    cfg.state_dir = tmp_path / "state"
    cfg.policy = Policy(granted=frozenset({Scope.READ}), roots=(tmp_path.resolve(),))
    cfg.llm.runtime = "none"

    runtime = JarvisRuntime(cfg, with_voice=False)
    runtime.setup()
    runtime.agent.llm = ScriptedLLM()
    app = create_app(runtime)
    with TestClient(app) as c:
        c.runtime = runtime
        yield c
    runtime.shutdown()


# -- Oberflaeche --------------------------------------------------------
def test_startseite_wird_ausgeliefert(client):
    antwort = client.get("/")
    assert antwort.status_code == 200
    assert "JARVIS" in antwort.text
    # Ohne JavaScript bliebe die Seite leer -- die Klasse muss mit.
    assert 'class="kein-js"' in antwort.text


def test_statische_dateien(client):
    for datei in ("stil.css", "kern.js", "dashboard.js"):
        antwort = client.get(f"/static/{datei}")
        assert antwort.status_code == 200, datei
        assert len(antwort.content) > 500


# -- Zustand ------------------------------------------------------------
def test_status_nennt_echte_werte(client):
    daten = client.get("/api/status").json()
    assert daten["zustand"] == "ohne sprache"
    assert daten["aufgaben_offen"] == 0
    assert "werkzeuge" in daten
    assert daten["laufzeit"] >= 0


def test_status_spiegelt_aufgaben(client):
    client.runtime.agent.tasks.create("Angebot schreiben")
    daten = client.get("/api/status").json()
    assert daten["aufgaben_offen"] == 1
    assert daten["aufgaben"][0]["titel"] == "Angebot schreiben"
    assert daten["aufgaben"][0]["status"] == "planned"


def test_aufgabenliste_zeigt_pruefvermerk(client):
    tasks = client.runtime.agent.tasks
    aufgabe = tasks.create("Datei pruefen")
    tasks.start(aufgabe.id)
    tasks.complete(aufgabe.id, "zwei Eintraege fehlen", "Spalte B geprueft")
    daten = client.get("/api/tasks?alle=true").json()
    erledigt = [a for a in daten["aufgaben"] if a["status"] == "done"][0]
    assert erledigt["pruefung"] == "Spalte B geprueft"
    assert daten["bericht"]["done"] == 1


def test_dashboard_zeigt_blockade_mit_grund(client):
    tasks = client.runtime.agent.tasks
    aufgabe = tasks.create("Mail senden")
    tasks.start(aufgabe.id)
    tasks.block(aufgabe.id, "Adresse fehlt")
    daten = client.get("/api/status").json()
    assert daten["aufgaben"][0]["grund"] == "Adresse fehlt"


def test_einzelne_aufgabe_mit_ereignissen(client):
    tasks = client.runtime.agent.tasks
    aufgabe = tasks.create("Mit Schritten")
    tasks.plan_steps(aufgabe.id, ["A", "B"])
    daten = client.get(f"/api/tasks/{aufgabe.id}").json()
    assert len(daten["schritte"]) == 2
    assert daten["ereignisse"][0]["kind"] == "created"


def test_unbekannte_aufgabe_ergibt_404(client):
    assert client.get("/api/tasks/9999").status_code == 404


def test_health_nennt_nicht_einsatzbereite_werkzeuge(client):
    daten = client.get("/api/health").json()
    assert "sprachmodell" in daten
    assert "nicht_bereit" in daten["werkzeuge"]
    assert daten["sprache"]["ok"] is False   # ohne Sprachpipeline


def test_protokoll_wird_geliefert(client):
    daten = client.get("/api/log").json()
    assert isinstance(daten["zeilen"], list)


# -- Bedienen -----------------------------------------------------------
def test_text_statt_sprache(client):
    antwort = client.post("/api/say", json={"text": "Moin"})
    assert antwort.status_code == 200
    assert antwort.json()["text"] == "Moin Noah."
    assert client.runtime.agent.llm.gefragt == ["Moin"]


def test_leerer_text_wird_abgewiesen(client):
    assert client.post("/api/say", json={"text": "  "}).status_code == 400


def test_wecken_ohne_pipeline_meldet_das_ehrlich(client):
    """Ohne Sprachpipeline wird nicht getan, als haette es geklappt."""
    antwort = client.post("/api/wake")
    assert antwort.status_code == 503
    assert "Sprachpipeline" in antwort.json()["detail"]


def test_unterbrechen_geht_immer(client):
    antwort = client.post("/api/interrupt")
    assert antwort.status_code == 200
    assert client.runtime.agent.cancel.is_set()


def test_gedaechtnis_lesen_und_loeschen(client):
    fakt = client.runtime.agent.long_term.remember("Noah", "Buero", "Hamburg")
    daten = client.get("/api/memory").json()
    assert any("Hamburg" in f["satz"] for f in daten["fakten"])
    client.delete(f"/api/memory/{fakt.id}")
    assert client.get("/api/memory").json()["fakten"] == []


def test_meldungen_zeigen_auch_die_stummen(client):
    from jarvis.notify.manager import Priority
    client.runtime.agent.notifications.push("Nur fuers Dashboard", Priority.INFO)
    daten = client.get("/api/notifications").json()
    assert daten["meldungen"][0]["text"] == "Nur fuers Dashboard"
    assert daten["meldungen"][0]["gesprochen"] is False
    assert "Schwelle" in daten["meldungen"][0]["stumm_weil"]


def test_rueckfrage_erscheint_im_status(client):
    """Wartet eine Bestaetigung, muss das Dashboard sie zeigen."""
    from jarvis.agent import PendingAction
    client.runtime.agent.pending = PendingAction(
        tool="datei_loeschen", arguments={"pfad": "/tmp/x"},
        description="datei_loeschen(pfad='/tmp/x')", scope="delete",
        created_at=0.0)
    daten = client.get("/api/status").json()
    assert "Soll ich das machen?" in daten["rueckfrage"]


# -- Live-Verbindung ----------------------------------------------------
def test_websocket_sendet_den_zustand(client):
    with client.websocket_connect("/ws") as ws:
        daten = ws.receive_json()
        assert daten["typ"] == "status"
        assert "zustand" in daten


# ======================================================================
# Herkunftspruefung
# ======================================================================
def test_websocket_von_fremder_seite_wird_abgewiesen(client):
    """Ein WebSocket unterliegt NICHT der Gleiche-Herkunft-Regel. Ohne diese
    Pruefung koennte jede Seite, die der Nutzer offen hat, den Zustandsstrom
    mitlesen -- darin stehen die letzte Aeusserung, die letzte Antwort, alle
    offenen Aufgaben und wartende Rueckfragen."""
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
                "/ws", headers={"Origin": "https://boese.example"}):
            pass


def test_websocket_von_eigener_seite_geht(client):
    with client.websocket_connect(
            "/ws", headers={"Origin": "http://127.0.0.1:8765"}) as ws:
        assert ws.receive_json()["typ"] == "status"


def test_websocket_ohne_herkunft_geht(client):
    """Nicht aus einem Browser-Dokument -- etwa ein eigenes Skript."""
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["typ"] == "status"


def test_fremde_seite_kann_das_mikrofon_nicht_einschalten(client):
    """Ein Formular auf einer beliebigen Seite kann an 127.0.0.1 abschicken,
    ohne Vorabfrage. Ohne Pruefung waere das ein Abhoerkanal."""
    antwort = client.post("/api/wake", headers={"Origin": "https://boese.example"})
    assert antwort.status_code == 403
    assert "fremden Seite" in antwort.json()["detail"]


def test_fremde_seite_kann_nicht_unterbrechen(client):
    assert client.post("/api/interrupt",
                       headers={"Origin": "https://boese.example"}).status_code == 403


def test_fremde_seite_kann_nichts_sagen_lassen(client):
    antwort = client.post("/api/say", json={"text": "Loesch alles"},
                          headers={"Origin": "https://boese.example"})
    assert antwort.status_code == 403


def test_fremde_seite_kann_nichts_loeschen(client):
    fakt = client.runtime.agent.long_term.remember("Noah", "Buero", "Hamburg")
    antwort = client.delete(f"/api/memory/{fakt.id}",
                            headers={"Origin": "https://boese.example"})
    assert antwort.status_code == 403
    assert client.runtime.agent.long_term.lookup("Noah", "Buero") is not None


def test_eigene_seite_darf_weiterhin_alles(client):
    kopf = {"Origin": "http://127.0.0.1:8765"}
    assert client.post("/api/interrupt", headers=kopf).status_code == 200
    assert client.post("/api/say", json={"text": "Moin"}, headers=kopf).status_code == 200


def test_lesen_bleibt_ohne_herkunftspruefung(client):
    """GET aendert nichts; eine fremde Seite kann die Antwort ohnehin nicht
    lesen (dafuer braeuchte sie CORS-Freigabe, die es nicht gibt)."""
    assert client.get("/api/status",
                      headers={"Origin": "https://boese.example"}).status_code == 200
