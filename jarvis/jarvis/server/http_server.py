"""HTTP-Dienst: Schnittstelle fuer das Dashboard und Rueckrufe von Twilio.

Bewusst die Standardbibliothek (``ThreadingHTTPServer``) statt eines
Webframeworks -- es ist ein Einzelnutzerdienst auf ``127.0.0.1``, und so
bleibt die Abhaengigkeitsliste bei genau einem Paket.

Der Server laeuft in einem eigenen Thread. Alles, was Jarvis-Logik
braucht, wird mit ``asyncio.run_coroutine_threadsafe`` in die Hauptschleife
geschoben; so gibt es nur einen Datenbestand und keine zweite Welt.

Zugang:
* ``/api/...`` braucht ``HTTP_API_TOKEN`` (Kopfzeile ``Authorization: Bearer ...``
  oder ``?token=``). Ohne gesetztes Token sind nur Zugriffe von localhost erlaubt.
* ``/telefon/...`` prueft die Twilio-Signatur, wenn ``PUBLIC_BASE_URL`` und der
  Twilio-Token vorliegen -- sonst koennte jeder ein Gespraech vortaeuschen.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import threading
import urllib.parse
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from ..adapters.phone.twilio import conversation_twiml, say
from ..core.timeutil import format_local
from ..db.database import iso, utcnow
from ..errors import JarvisError

log = logging.getLogger(__name__)

DASHBOARD_DIR = Path(__file__).resolve().parent / "dashboard"
MAX_BODY = 256 * 1024
MAX_VOICE_TURNS = 24


def validate_twilio_signature(auth_token: str, url: str, params: dict[str, str],
                              signature: str) -> bool:
    """Twilio-Signatur pruefen (HMAC-SHA1 ueber URL + sortierte Felder)."""
    if not (auth_token and signature):
        return False
    payload = url + "".join(f"{key}{params[key]}" for key in sorted(params))
    digest = hmac.new(auth_token.encode("utf-8"), payload.encode("utf-8"), hashlib.sha1).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode("utf-8"), signature)


class JarvisHTTPServer:
    def __init__(self, services: Any, loop: asyncio.AbstractEventLoop) -> None:
        self.services = services
        self.settings = services.settings
        self.loop = loop
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    # ---------------------------------------------------------------- Betrieb
    def start(self) -> str:
        handler = _make_handler(self)
        try:
            self._server = ThreadingHTTPServer(
                (self.settings.http_host, self.settings.http_port), handler
            )
        except OSError as exc:
            raise JarvisError(
                f"Der HTTP-Dienst konnte Port {self.settings.http_port} nicht belegen: {exc}",
                hint="HTTP_PORT aendern oder den belegenden Prozess beenden.",
            ) from exc
        self._server.daemon_threads = True
        self._thread = threading.Thread(
            target=self._server.serve_forever, name="jarvis-http", daemon=True
        )
        self._thread.start()
        address = f"http://{self.settings.http_host}:{self.settings.http_port}"
        log.info("HTTP-Dienst laeuft auf %s", address)
        return address

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    # -------------------------------------------------------- Hilfsfunktionen
    def run_async(self, coroutine, timeout: float = 120.0) -> Any:
        """Eine Coroutine in der Hauptschleife ausfuehren und auf sie warten."""
        future = asyncio.run_coroutine_threadsafe(coroutine, self.loop)
        return future.result(timeout=timeout)

    def authorized(self, handler: BaseHTTPRequestHandler, query: dict[str, list[str]]) -> bool:
        token = self.settings.http_api_token
        if not token:
            # Ohne Token nur vom eigenen Rechner -- besser als offen.
            return handler.client_address[0] in {"127.0.0.1", "::1", "localhost"}
        provided = ""
        header = handler.headers.get("Authorization", "")
        if header.lower().startswith("bearer "):
            provided = header[7:].strip()
        provided = provided or handler.headers.get("X-Api-Token", "") or \
            (query.get("token", [""])[0])
        return bool(provided) and hmac.compare_digest(provided, token)

    def twilio_ok(self, handler: BaseHTTPRequestHandler, path_with_query: str,
                  params: dict[str, str]) -> bool:
        """Signatur pruefen. ``path_with_query`` muss die Query enthalten --
        Twilio signiert die Adresse, die es tatsaechlich aufgerufen hat."""
        auth_token = self.settings.twilio_auth_token
        if not auth_token:
            return False
        if not self.settings.public_base_url:
            # Ohne bekannte oeffentliche URL ist die Signatur nicht pruefbar.
            log.warning("Telefonie-Rueckruf ohne PUBLIC_BASE_URL -- nur localhost erlaubt")
            return handler.client_address[0] in {"127.0.0.1", "::1"}
        signature = handler.headers.get("X-Twilio-Signature", "")
        url = f"{self.settings.public_base_url}{path_with_query}"
        if validate_twilio_signature(auth_token, url, params, signature):
            return True
        log.warning(
            "Telefonie-Rueckruf mit falscher Signatur abgewiesen (%s)", path_with_query
        )
        return False


def _make_handler(service: JarvisHTTPServer):
    settings = service.settings

    class Handler(BaseHTTPRequestHandler):
        server_version = "Jarvis"
        protocol_version = "HTTP/1.1"

        # --- Antworten ----------------------------------------------------
        def _send(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def json(self, data: Any, status: int = 200) -> None:
            self._send(
                status,
                json.dumps(data, ensure_ascii=False, default=str).encode("utf-8"),
                "application/json; charset=utf-8",
            )

        def text(self, content: str, status: int = 200) -> None:
            self._send(status, content.encode("utf-8"), "text/plain; charset=utf-8")

        def xml(self, content: str, status: int = 200) -> None:
            self._send(status, content.encode("utf-8"), "application/xml; charset=utf-8")

        def log_message(self, fmt: str, *args: Any) -> None:
            log.debug("HTTP %s", fmt % args)

        # --- Eingaben -----------------------------------------------------
        def _body(self) -> tuple[dict[str, Any], dict[str, str]]:
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length <= 0 or length > MAX_BODY:
                return {}, {}
            raw = self.rfile.read(length)
            content_type = self.headers.get("Content-Type", "")
            if "json" in content_type:
                try:
                    return json.loads(raw.decode("utf-8")), {}
                except (UnicodeDecodeError, json.JSONDecodeError):
                    return {}, {}
            form = {
                key: values[0]
                for key, values in urllib.parse.parse_qs(raw.decode("utf-8", "replace")).items()
            }
            return dict(form), form

        # --- Routen -------------------------------------------------------
        def do_GET(self) -> None:  # noqa: N802
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            path = parsed.path.rstrip("/") or "/"

            if path == "/" or path == "/index.html":
                self._serve_dashboard()
                return
            if path == "/gesundheit":
                self.json({"status": "ok", "zeit": iso(utcnow())})
                return
            if path.startswith("/audio/"):
                self._serve_audio(Path(path).name)
                return
            if path.startswith("/api/"):
                if not service.authorized(self, query):
                    self.json({"fehler": "nicht autorisiert"}, status=401)
                    return
                self._api_get(path, query)
                return
            self.json({"fehler": "unbekannter Pfad"}, status=404)

        def do_POST(self) -> None:  # noqa: N802
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            path = parsed.path.rstrip("/") or "/"
            payload, form = self._body()

            if path.startswith("/telefon/"):
                # Twilio signiert die vollstaendige URL samt Query -- also
                # self.path, nicht den fuer die Zuordnung gekuerzten Pfad.
                if not service.twilio_ok(self, self.path, form):
                    self.xml(
                        '<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>',
                        status=403,
                    )
                    return
                self._telephony(path, payload, query)
                return

            if path.startswith("/api/"):
                if not service.authorized(self, query):
                    self.json({"fehler": "nicht autorisiert"}, status=401)
                    return
                self._api_post(path, payload)
                return
            self.json({"fehler": "unbekannter Pfad"}, status=404)

        def do_HEAD(self) -> None:  # noqa: N802
            self.do_GET()

        # --- Dashboard ----------------------------------------------------
        def _serve_dashboard(self) -> None:
            page = DASHBOARD_DIR / "index.html"
            if not page.exists():
                self.text("Kein Dashboard hinterlegt.", status=404)
                return
            self._send(200, page.read_bytes(), "text/html; charset=utf-8")

        def _serve_audio(self, name: str) -> None:
            if not name.endswith(".wav") or "/" in name or ".." in name:
                self.text("ungueltig", status=400)
                return
            target = settings.data_dir / "audio" / name
            if not target.exists():
                self.text("nicht gefunden", status=404)
                return
            self._send(200, target.read_bytes(), "audio/wav")

        # --- API ----------------------------------------------------------
        def _api_get(self, path: str, query: dict[str, list[str]]) -> None:
            services = service.services
            tz = settings.tz
            limit = int((query.get("limit", ["30"])[0] or 30))

            if path == "/api/status":
                data = services.status_snapshot()
                try:
                    states = service.run_async(services.health(), timeout=45)
                    data["komponenten"] = [
                        {"name": s.name, "ok": s.ok, "hinweis": s.detail,
                         "eingerichtet": s.configured}
                        for s in states
                    ]
                except Exception as exc:  # pragma: no cover
                    data["komponenten_fehler"] = str(exc)
                data["einrichtung_offen"] = [
                    {"titel": step.titel, "was_tun": step.was_tun, "blockierend": step.blockierend}
                    for step in settings.missing_setup()
                ]
                self.json(data)
            elif path == "/api/aufgaben":
                status = query.get("status", ["offen"])[0]
                mapping = {"offen": ("offen", "laeuft"), "alle": None,
                           "erledigt": ("erledigt",)}
                tasks = services.tasks.list(status=mapping.get(status, ("offen", "laeuft")),
                                            limit=limit)
                self.json([{
                    "id": t.id, "titel": t.title, "status": t.status, "prioritaet": t.priority,
                    "faellig": format_local(t.due_at, tz) if t.due_at else "",
                    "faellig_iso": iso(t.due_at) if t.due_at else "",
                    "projekt": t.project, "notizen": t.notes,
                } for t in tasks])
            elif path == "/api/erinnerungen":
                reminders = services.reminders.upcoming(limit=limit, include_done=False)
                self.json([{
                    "id": r.id, "text": r.text, "faellig": format_local(r.due_at, tz),
                    "faellig_iso": iso(r.due_at), "status": r.status,
                    "wiederholung": r.recurrence, "kanal": r.channel,
                } for r in reminders])
            elif path == "/api/termine":
                days = int(query.get("tage", ["7"])[0] or 7)
                try:
                    events = service.run_async(
                        services.calendar.list_events(utcnow(), utcnow() + timedelta(days=days)),
                        timeout=60,
                    )
                    self.json([event.as_dict(tz) for event in events])
                except Exception as exc:
                    self.json({"fehler": str(exc)}, status=502)
            elif path == "/api/ereignisse":
                self.json(services.memory.recent_events(limit=limit))
            elif path == "/api/gedaechtnis":
                self.json([{
                    "id": e.id, "schluessel": e.key, "wert": e.value,
                    "art": e.kind, "wichtigkeit": e.importance,
                } for e in services.memory.list_memory(limit=limit)])
            elif path == "/api/auftraege":
                self.json({
                    "geplant": [{"id": j.id, "art": j.kind,
                                 "faellig": format_local(j.run_at, tz),
                                 "wiederholung": j.recurrence}
                                for j in services.queue.pending(limit=limit)],
                    "fehlgeschlagen": [{"id": j.id, "art": j.kind, "fehler": j.last_error}
                                       for j in services.queue.failed(limit=10)],
                })
            elif path == "/api/protokoll":
                self.json(services.recent_log(limit=limit))
            elif path == "/api/werkzeuge":
                self.json({
                    "aufrufe": services.toolkit.recent_calls(limit=limit),
                    "verfuegbar": services.toolkit.descriptions(),
                })
            elif path == "/api/anrufe":
                self.json(services.phone.recent_calls(limit=limit) if services.phone else [])
            else:
                self.json({"fehler": "unbekannter Pfad"}, status=404)

        def _api_post(self, path: str, payload: dict[str, Any]) -> None:
            services = service.services
            if path == "/api/nachricht":
                text = str(payload.get("text", "")).strip()
                if not text:
                    self.json({"fehler": "kein Text"}, status=400)
                    return
                chat_id = str(payload.get("chat") or f"dashboard:{services.owner_chat_id or 'lokal'}")
                try:
                    reply = service.run_async(
                        services.build_agent().handle(chat_id, text, channel="dashboard"),
                        timeout=300,
                    )
                except Exception as exc:
                    self.json({"fehler": str(exc)}, status=500)
                    return
                self.json({
                    "antwort": reply.text, "werkzeuge": reply.tool_names,
                    "bestaetigung": reply.confirmation_token,
                    "knoepfe": [{"text": t, "daten": d} for t, d in reply.buttons],
                })
            elif path == "/api/werkzeug":
                name = str(payload.get("name", ""))
                arguments = payload.get("argumente") or {}
                try:
                    reply = service.run_async(
                        services.build_agent().run_tool_directly(
                            name, arguments, chat_id="dashboard"
                        ),
                        timeout=180,
                    )
                except Exception as exc:
                    self.json({"fehler": str(exc)}, status=500)
                    return
                self.json({"ergebnis": reply.text, "bestaetigung": reply.confirmation_token})
            elif path == "/api/bestaetigen":
                token = str(payload.get("token", ""))
                try:
                    reply = service.run_async(
                        services.build_agent().confirm(token, chat_id="dashboard"), timeout=180
                    )
                except Exception as exc:
                    self.json({"fehler": str(exc)}, status=500)
                    return
                self.json({"ergebnis": reply.text})
            elif path == "/api/aufgabe":
                title = str(payload.get("titel", "")).strip()
                if not title:
                    self.json({"fehler": "kein Titel"}, status=400)
                    return
                task = services.tasks.create(
                    title, notes=str(payload.get("notizen", "")),
                    priority=payload.get("prioritaet", 3),
                )
                self.json({"id": task.id, "titel": task.title})
            elif path == "/api/aufgabe/erledigt":
                task_id = int(payload.get("id", 0))
                task = services.tasks.complete(task_id, str(payload.get("ergebnis", "")))
                if task is None:
                    self.json({"fehler": "unbekannte Aufgabe"}, status=404)
                    return
                self.json({"id": task.id, "status": task.status})
            elif path == "/api/sicherung":
                target = services.db.backup(settings.backup_dir, keep=settings.backup_keep)
                services.store.set("letzte_sicherung", iso(utcnow()))
                self.json({"datei": target.name})
            else:
                self.json({"fehler": "unbekannter Pfad"}, status=404)

        # --- Telefonie ----------------------------------------------------
        def _telephony(self, path: str, payload: dict[str, Any],
                       query: dict[str, list[str]]) -> None:
            services = service.services
            voice = settings.phone_voice
            language = settings.phone_language

            if path == "/telefon/erinnerung-antwort":
                digits = str(payload.get("Digits", ""))
                reminder_id = int((query.get("erinnerung", ["0"])[0] or 0))
                if digits == "1" and reminder_id:
                    services.reminders.confirm(reminder_id)
                    services.memory.remember_event(
                        "erinnerung_bestaetigt_telefon", f"#{reminder_id}", {"taste": digits}
                    )
                    answer = "Erledigt, ich habe es abgehakt. Bis spaeter."
                elif digits == "2" and reminder_id:
                    services.reminders.snooze(
                        reminder_id, utcnow() + timedelta(minutes=settings.phone_retry_minutes)
                    )
                    answer = (
                        f"Gut, ich erinnere in {settings.phone_retry_minutes} Minuten noch einmal."
                    )
                else:
                    answer = "Ich habe das nicht verstanden. Bis spaeter."
                self.xml(
                    '<?xml version="1.0" encoding="UTF-8"?><Response>'
                    + say(answer, voice=voice, language=language)
                    + "<Hangup/></Response>"
                )
                return

            if path == "/telefon/gespraech":
                call_sid = str(payload.get("CallSid", "")) or "ohne-sid"
                spoken = str(payload.get("SpeechResult", "")).strip()
                opening = (query.get("text", [""])[0] or "").strip()
                action = f"{settings.public_base_url}/telefon/gespraech"

                row = services.db.query_one(
                    "SELECT turns FROM voice_session WHERE call_sid = ?", (call_sid,)
                )
                turns = int(row["turns"]) if row else 0
                if row is None:
                    services.db.execute(
                        "INSERT INTO voice_session (call_sid, chat_id, state, turns, created_at, "
                        "updated_at) VALUES (?, ?, '{}', 0, ?, ?)",
                        (call_sid, f"telefon:{call_sid}", iso(utcnow()), iso(utcnow())),
                    )

                if not spoken:
                    greeting = opening or (
                        "Hallo, hier ist Jarvis. Was kann ich fuer dich tun?"
                    )
                    self.xml(conversation_twiml(
                        greeting, voice=voice, language=language, action_url=action
                    ))
                    return

                if turns >= MAX_VOICE_TURNS:
                    self.xml(conversation_twiml(
                        "Lass uns das spaeter weiterfuehren. Ich schreibe dir in Telegram.",
                        voice=voice, language=language, action_url=action, hangup=True,
                    ))
                    return

                lowered = spoken.lower()
                if any(word in lowered for word in (
                    "auflegen", "tschuess", "tschüss", "danke das wars", "das war es",
                    "ende", "beenden", "auf wiederhoeren", "auf wiederhören",
                )):
                    services.memory.add_message(
                        f"telefon:{call_sid}", "user", spoken, channel="telefon"
                    )
                    services.phone and services.phone.note_result(
                        call_sid, "beendet", transcript=spoken
                    )
                    self.xml(conversation_twiml(
                        "Gut, bis dann.", voice=voice, language=language,
                        action_url=action, hangup=True,
                    ))
                    return

                try:
                    reply = service.run_async(
                        services.build_agent().handle(
                            f"telefon:{call_sid}", spoken, channel="telefon"
                        ),
                        timeout=90,
                    )
                    answer = reply.text
                    if reply.needs_confirmation:
                        # Am Telefon wird nichts Aussenwirksames freigegeben.
                        services.permissions.reject(reply.confirmation_token)
                        answer = (
                            "Das braucht eine Bestaetigung. Ich schicke sie dir gleich "
                            "in Telegram, dann kannst du dort tippen."
                        )
                except Exception:
                    log.exception("Telefongespraech fehlgeschlagen")
                    answer = "Da ist mir etwas dazwischengekommen. Versuch es nochmal."

                services.db.execute(
                    "UPDATE voice_session SET turns = turns + 1, updated_at = ? WHERE call_sid = ?",
                    (iso(utcnow()), call_sid),
                )
                spoken_answer = _for_speech(answer)
                self.xml(conversation_twiml(
                    spoken_answer, voice=voice, language=language, action_url=action
                ))
                return

            if path == "/telefon/status":
                sid = str(payload.get("CallSid", ""))
                status = str(payload.get("CallStatus", ""))
                if sid and services.phone is not None:
                    services.phone.note_result(sid, status)
                    services.memory.remember_event(
                        "anruf_beendet", sid, {"status": status},
                        ok=status in {"completed"},
                    )
                self.xml('<?xml version="1.0" encoding="UTF-8"?><Response/>')
                return

            self.xml('<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>',
                     status=404)

    return Handler


def _for_speech(text: str) -> str:
    """Markdown und Listen entfernen -- es wird vorgelesen."""
    cleaned = text.replace("*", "").replace("_", "").replace("`", "")
    cleaned = cleaned.replace("•", ". ").replace("—", ", ").replace("–", " bis ")
    lines = [line.strip(" -\t") for line in cleaned.splitlines() if line.strip()]
    spoken = ". ".join(lines)
    return spoken[:900] if spoken else "Dazu habe ich gerade nichts."
