"""Dashboard: Kommandozentrale im Browser.

FastAPI mit einem WebSocket fuer den Zustand und einer Handvoll
REST-Endpunkten. Zwei Entscheidungen praegen den Aufbau:

* **Das Dashboard rechnet nichts.** Es liest den Zustand, den Pipeline, Agent
  und Aufgabenmanager ohnehin fuehren. So kann es nicht behaupten, eine
  Aufgabe sei fertig, wenn der Aufgabenmanager das nicht sagt.
* **Es blockiert nie.** Alles Langlaufende (Modell, Audio) laeuft in eigenen
  Faeden; die Endpunkte lesen nur. Darum bleibt die Oberflaeche bedienbar,
  waehrend die Sprachverarbeitung ausgelastet ist.

Gebunden wird auf 127.0.0.1: das Dashboard kann Aufgaben ansehen und das
Mikrofon aktivieren, das gehoert nicht ins Netz.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from pathlib import Path

# Auf Modulebene, nicht in create_app: wegen ``from __future__ import
# annotations`` sind Typangaben Strings, die FastAPI gegen die Modulglobals
# aufloest. Lagen die Namen nur lokal in der Funktion, hielte FastAPI den
# WebSocket-Parameter fuer einen Query-Parameter und wiese die Verbindung ab.
# Dass fastapi fehlen kann, ist in Ordnung: dieses Modul wird nur geladen,
# wenn das Dashboard laeuft.
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from ..logging_setup import RING, get_logger

log = get_logger("dashboard")

WEB_DIR = Path(__file__).parent / "web"


def erlaubte_herkuenfte(host: str, port: int) -> set[str]:
    """Die Adressen, unter denen das eigene Dashboard erreichbar ist."""
    namen = {host, "127.0.0.1", "localhost", "[::1]"}
    return {f"{schema}://{name}:{port}"
            for name in namen for schema in ("http", "https")}


def herkunft_passt(origin: str | None, erlaubt: set[str]) -> bool:
    """Prueft den Origin-Kopf einer Anfrage.

    Fehlt der Kopf, ist die Anfrage **nicht** aus einem Browser-Dokument
    gekommen (curl, ein Skript, die eigene fetch-Anfrage gleicher Herkunft bei
    manchen Browsern) -- das ist in Ordnung. Ist er gesetzt und passt nicht,
    stammt sie von einer fremden Seite und wird abgelehnt.
    """
    if not origin or origin == "null":
        return True
    return origin.rstrip("/") in erlaubt


class DashboardState:
    """Haelt die Verbindungen und verteilt Zustandsaenderungen."""

    def __init__(self) -> None:
        self._clients: set = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = asyncio.Lock()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def add(self, websocket) -> None:
        async with self._lock:
            self._clients.add(websocket)

    async def remove(self, websocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def broadcast(self, nachricht: dict) -> None:
        async with self._lock:
            empfaenger = list(self._clients)
        text = json.dumps(nachricht, ensure_ascii=False)
        for websocket in empfaenger:
            try:
                await websocket.send_text(text)
            except Exception:  # noqa: BLE001 -- Verbindung weg, kein Drama
                await self.remove(websocket)

    def broadcast_threadsafe(self, nachricht: dict) -> None:
        """Aus einem fremden Faden (Pipeline) senden.

        Die Pipeline laeuft nicht im Event-Loop; ohne diesen Umweg gaebe es
        einen Fehler ueber den falschen Faden.
        """
        if self._loop is None or self._loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast(nachricht), self._loop)
        except RuntimeError:
            pass


def create_app(runtime):
    """Baut die Anwendung. ``runtime`` ist ein ``JarvisRuntime``."""
    zustand = DashboardState()
    erlaubt = erlaubte_herkuenfte(runtime.config.dashboard_host,
                                  runtime.config.dashboard_port)

    @contextlib.asynccontextmanager
    async def lifespan(_app: FastAPI):
        # Der Event-Loop wird erst hier bekannt -- die Pipeline braucht ihn,
        # um aus ihrem eigenen Faden ins Dashboard zu senden.
        zustand.bind_loop(asyncio.get_running_loop())
        runtime.attach_dashboard(zustand)
        yield

    app = FastAPI(title="JARVIS", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.dashboard = zustand
    app.state.runtime = runtime
    app.state.erlaubte_herkuenfte = erlaubt

    @app.middleware("http")
    async def herkunft_pruefen(request: Request, call_next):
        """Weist aendernde Anfragen von fremden Seiten ab.

        Das Dashboard laeuft auf 127.0.0.1, aber das schuetzt nicht: eine
        beliebige Webseite im Browser des Nutzers kann ein Formular an
        127.0.0.1 abschicken (ein einfacher Querverweis-Antrag, der ohne
        Vorabfrage durchgeht). Ohne diese Pruefung koennte eine fremde Seite
        das Mikrofon einschalten.
        """
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            if not herkunft_passt(request.headers.get("origin"), erlaubt):
                log.warning("Anfrage von fremder Herkunft abgewiesen: %s %s (%s)",
                            request.method, request.url.path,
                            request.headers.get("origin"))
                return JSONResponse(
                    {"detail": "Anfrage von einer fremden Seite abgewiesen."},
                    status_code=403)
        return await call_next(request)

    # -- Oberflaeche ----------------------------------------------------
    if WEB_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")

    @app.get("/favicon.ico")
    async def favicon():
        datei = WEB_DIR / "kern.svg"
        if not datei.exists():
            return JSONResponse({}, status_code=404)
        return FileResponse(datei, media_type="image/svg+xml")

    @app.get("/")
    async def index():
        datei = WEB_DIR / "index.html"
        if not datei.exists():
            return JSONResponse({"fehler": "Oberflaeche fehlt"}, status_code=500)
        return FileResponse(datei)

    # -- Zustand lesen --------------------------------------------------
    @app.get("/api/status")
    async def status():
        return runtime.snapshot()

    @app.get("/api/tasks")
    async def tasks(alle: bool = False):
        aufgaben = runtime.agent.tasks.list(open_only=not alle, limit=100)
        return {
            "aufgaben": [
                {
                    "id": t.id, "titel": t.title, "status": t.status.value,
                    "zusammenfassung": t.summary(), "grund": t.blocked_reason,
                    "ergebnis": t.result, "pruefung": t.verification,
                    "prioritaet": t.priority, "geaendert": t.updated_at,
                }
                for t in aufgaben
            ],
            "bericht": runtime.agent.tasks.status_report(),
        }

    @app.get("/api/tasks/{task_id}")
    async def task(task_id: int):
        from ..tasks.manager import TaskError
        try:
            aufgabe = runtime.agent.tasks.get(task_id, with_subtasks=True)
        except TaskError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return {
            "id": aufgabe.id, "titel": aufgabe.title, "detail": aufgabe.detail,
            "status": aufgabe.status.value, "ergebnis": aufgabe.result,
            "pruefung": aufgabe.verification, "grund": aufgabe.blocked_reason,
            "schritte": [{"id": s.id, "titel": s.title, "status": s.status.value}
                         for s in aufgabe.subtasks],
            "ereignisse": runtime.agent.tasks.events(aufgabe.id),
        }

    @app.get("/api/notifications")
    async def notifications():
        verlauf = runtime.agent.notifications.history(50)
        return {"meldungen": [
            {"text": n.text, "prioritaet": n.priority.name,
             "gesprochen": n.spoken_at is not None,
             "stumm_weil": n.silenced_reason, "zeit": n.created_at,
             "aufgabe": n.task_id}
            for n in reversed(verlauf)
        ]}

    @app.get("/api/health")
    async def health():
        return runtime.health()

    @app.get("/api/log")
    async def protokoll(limit: int = 100):
        return {"zeilen": RING.tail(min(limit, 500))}

    @app.get("/api/memory")
    async def memory():
        return {"fakten": [
            {"id": f.id, "satz": f.as_sentence(), "art": f.kind, "quelle": f.source}
            for f in runtime.agent.long_term.all()
        ]}

    # -- Bedienen -------------------------------------------------------
    @app.post("/api/wake")
    async def wake():
        if runtime.pipeline is None:
            raise HTTPException(status_code=503,
                                detail="Die Sprachpipeline laeuft nicht.")
        runtime.pipeline.wake()
        return {"zustand": runtime.pipeline.state.value}

    @app.post("/api/interrupt")
    async def interrupt():
        runtime.agent.interrupt()
        verworfen = 0
        if runtime.pipeline is not None:
            verworfen = runtime.pipeline.speaker.interrupt()
        return {"verworfen": verworfen}

    @app.post("/api/say")
    async def say(nachricht: dict):
        """Texteingabe statt Sprache -- fuer leise Umgebungen und Tests."""
        text = (nachricht.get("text") or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="Kein Text.")
        # In einem Faden, damit der Event-Loop frei bleibt.
        antwort = await asyncio.to_thread(runtime.agent.respond, text)
        await zustand.broadcast({"typ": "antwort", "text": antwort.text})
        return {
            "text": antwort.text,
            "werkzeuge": [{"name": w.tool, "ok": w.ok, "meldung": w.message}
                          for w in antwort.tool_runs],
            "rueckfrage": antwort.pending.question() if antwort.pending else None,
            "fehler": antwort.error,
        }

    @app.delete("/api/memory/{fact_id}")
    async def forget(fact_id: int):
        runtime.agent.long_term.forget(fact_id)
        return {"geloescht": fact_id}

    # -- Live-Verbindung ------------------------------------------------
    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        # Vor dem Annehmen pruefen. Ein WebSocket unterliegt NICHT der
        # Gleiche-Herkunft-Regel: ohne diese Pruefung koennte jede beliebige
        # Seite, die der Nutzer offen hat, eine Verbindung hierher aufbauen
        # und den Strom mitlesen -- darin stehen die letzte Aeusserung, die
        # letzte Antwort, alle offenen Aufgaben und wartende Rueckfragen.
        if not herkunft_passt(websocket.headers.get("origin"), erlaubt):
            log.warning("WebSocket von fremder Herkunft abgewiesen: %s",
                        websocket.headers.get("origin"))
            await websocket.close(code=1008, reason="fremde Herkunft")
            return
        await websocket.accept()
        await zustand.add(websocket)
        try:
            await websocket.send_text(json.dumps(
                {"typ": "status", **runtime.snapshot()}, ensure_ascii=False))
            while True:
                # Takt: auch ohne Zustandswechsel regelmaessig senden, damit
                # Pegel und Laufzeiten im Dashboard nicht einfrieren.
                try:
                    await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                except asyncio.TimeoutError:
                    pass
                await websocket.send_text(json.dumps(
                    {"typ": "status", **runtime.snapshot()}, ensure_ascii=False))
        except WebSocketDisconnect:
            pass
        except Exception as exc:  # noqa: BLE001
            log.debug("WebSocket beendet: %s", exc)
        finally:
            await zustand.remove(websocket)

    return app
