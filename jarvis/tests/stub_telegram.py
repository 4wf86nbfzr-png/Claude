"""Stellvertreter fuer die Telegram-Bot-API.

Damit laeuft die *echte* Abrufschleife des Adapters gegen einen Server, der
sich wie Telegram verhaelt: ``getUpdates`` liefert eingestellte Nachrichten,
``sendMessage`` legt Antworten ab, ``getFile`` und der Dateiabruf liefern eine
Sprachnachricht. So wird geprueft, was im Container sonst nicht geht --
api.telegram.org ist von hier nicht erreichbar.

Kein Testwerkzeug von der Stange: nur ``http.server``, damit der Stellvertreter
nichts mitbringt, was die Laufzeit nicht auch hat.
"""

from __future__ import annotations

import json
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


class TelegramStub:
    def __init__(self, port: int = 8841, token: str = "testtoken") -> None:
        self.port = port
        self.token = token
        #: Noch nicht abgeholte Aktualisierungen.
        self.updates: list[dict[str, Any]] = []
        #: Was der Bot gesendet hat -- (Methode, Nutzlast).
        self.sent: list[tuple[str, dict[str, Any]]] = []
        #: Inhalt, den der Dateiabruf liefert.
        self.file_bytes = b"OggS-Sprachnachricht-Platzhalter"
        self.next_update_id = 100
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    # --- Steuerung von aussen --------------------------------------------
    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def push_message(self, text: str, *, user_id: int = 4711, chat_id: int | None = None,
                     voice: dict[str, Any] | None = None) -> int:
        self.next_update_id += 1
        nachricht: dict[str, Any] = {
            "message_id": self.next_update_id,
            "chat": {"id": chat_id if chat_id is not None else user_id, "type": "private"},
            "from": {"id": user_id, "first_name": "Test", "is_bot": False},
        }
        if voice is not None:
            nachricht["voice"] = voice
        else:
            nachricht["text"] = text
        self.updates.append({"update_id": self.next_update_id, "message": nachricht})
        return self.next_update_id

    def push_callback(self, data: str, *, user_id: int = 4711) -> int:
        self.next_update_id += 1
        self.updates.append({"update_id": self.next_update_id, "callback_query": {
            "id": f"cb{self.next_update_id}", "data": data,
            "from": {"id": user_id, "first_name": "Test"},
            "message": {"message_id": self.next_update_id,
                        "chat": {"id": user_id, "type": "private"}},
        }})
        return self.next_update_id

    def texts(self) -> list[str]:
        return [p.get("text", "") for m, p in self.sent if m == "sendMessage"]

    def calls(self, method: str) -> list[dict[str, Any]]:
        return [p for m, p in self.sent if m == method]

    # --- Betrieb ----------------------------------------------------------
    def start(self) -> str:
        stub = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def _antwort(self, data: Any, status: int = 200) -> None:
                koerper = json.dumps(data).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(koerper)))
                self.end_headers()
                self.wfile.write(koerper)

            def log_message(self, *args: Any) -> None:
                return

            def do_GET(self) -> None:  # noqa: N802
                # Dateiabruf: /file/bot<token>/<pfad>
                if "/file/bot" in self.path:
                    self.send_response(200)
                    self.send_header("Content-Type", "audio/ogg")
                    self.send_header("Content-Length", str(len(stub.file_bytes)))
                    self.end_headers()
                    self.wfile.write(stub.file_bytes)
                    return
                self._antwort({"ok": False, "description": "nur POST"}, status=404)

            def do_POST(self) -> None:  # noqa: N802
                laenge = int(self.headers.get("Content-Length", "0") or 0)
                roh = self.rfile.read(laenge) if laenge else b"{}"
                try:
                    nutzlast = json.loads(roh.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    nutzlast = {
                        k: v[0] for k, v in
                        urllib.parse.parse_qs(roh.decode("utf-8", "replace")).items()
                    }
                methode = self.path.rstrip("/").rsplit("/", 1)[-1]

                if f"/bot{stub.token}/" not in self.path:
                    self._antwort({"ok": False, "error_code": 401,
                                   "description": "Unauthorized"}, status=401)
                    return

                if methode == "getMe":
                    self._antwort({"ok": True, "result": {
                        "id": 1, "is_bot": True, "username": "jarvis_stub_bot"}})
                    return
                if methode == "getUpdates":
                    offset = int(nutzlast.get("offset", 0) or 0)
                    ausstehend = [u for u in stub.updates if u["update_id"] >= offset]
                    # Abgeholtes gilt als zugestellt -- wie bei Telegram, sobald
                    # der Versatz darueber hinaus gesetzt wird.
                    stub.updates = [u for u in stub.updates if u not in ausstehend]
                    self._antwort({"ok": True, "result": ausstehend})
                    return
                if methode == "getFile":
                    stub.sent.append((methode, nutzlast))
                    self._antwort({"ok": True, "result": {
                        "file_id": nutzlast.get("file_id", ""),
                        "file_path": "voice/datei.oga"}})
                    return

                stub.sent.append((methode, nutzlast))
                self._antwort({"ok": True, "result": {"message_id": len(stub.sent)}})

        self._server = ThreadingHTTPServer(("127.0.0.1", self.port), Handler)
        self._server.daemon_threads = True
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self.base_url

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread is not None:
            self._thread.join(timeout=3)
            self._thread = None
