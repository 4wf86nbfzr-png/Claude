"""Stellvertreter fuer die drei KI-Schnittstellen.

Antwortet wie Ollama (``/api/chat``), wie die OpenAI-Chat-Schnittstelle
(``/chat/completions``) und wie Anthropic (``/messages``) -- einschliesslich
der jeweiligen Form von Werkzeugaufrufen. Damit laeuft der echte
Anbieter-Code: Anfrageaufbau, Antwortauswertung, Fehlerbehandlung.

Die zuletzt empfangene Anfrage liegt in ``last_request``, sodass geprueft
werden kann, *was* Jarvis tatsaechlich geschickt hat.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


class AiStub:
    def __init__(self, port: int = 8871) -> None:
        self.port = port
        self.requests: list[tuple[str, dict[str, Any], dict[str, str]]] = []
        #: Antworten, die der Reihe nach ausgeliefert werden.
        self.replies: list[dict[str, Any]] = []
        #: Antwortkennzahl; 0 heisst "normal antworten".
        self.fail_with: int = 0
        #: Anzahl der Anfragen, die scheitern sollen, danach wieder normal.
        self.fail_times: int = 0
        self.models = ["llama3.1:8b", "qwen2.5:7b"]
        self.reject_tools = False
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    @property
    def last_request(self) -> dict[str, Any]:
        return self.requests[-1][1] if self.requests else {}

    @property
    def last_headers(self) -> dict[str, str]:
        return self.requests[-1][2] if self.requests else {}

    def queue(self, antwort: dict[str, Any]) -> None:
        self.replies.append(antwort)

    # --- vorgefertigte Antwortformen -------------------------------------
    @staticmethod
    def ollama_text(text: str) -> dict[str, Any]:
        return {"message": {"role": "assistant", "content": text}, "done_reason": "stop"}

    @staticmethod
    def ollama_tool(name: str, arguments: dict[str, Any], text: str = "") -> dict[str, Any]:
        return {"message": {"role": "assistant", "content": text, "tool_calls": [
            {"id": "aufruf-1", "function": {"name": name, "arguments": arguments}}
        ]}}

    @staticmethod
    def openai_text(text: str) -> dict[str, Any]:
        return {"choices": [{"message": {"role": "assistant", "content": text},
                             "finish_reason": "stop"}]}

    @staticmethod
    def openai_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        # OpenAI liefert die Argumente als JSON-Zeichenkette.
        return {"choices": [{"message": {"role": "assistant", "content": None, "tool_calls": [
            {"id": "call_1", "type": "function", "function": {
                "name": name, "arguments": json.dumps(arguments)}}
        ]}, "finish_reason": "tool_calls"}]}

    @staticmethod
    def anthropic_text(text: str) -> dict[str, Any]:
        return {"content": [{"type": "text", "text": text}], "stop_reason": "end_turn"}

    @staticmethod
    def anthropic_tool(name: str, arguments: dict[str, Any], text: str = "") -> dict[str, Any]:
        bloecke: list[dict[str, Any]] = []
        if text:
            bloecke.append({"type": "text", "text": text})
        bloecke.append({"type": "tool_use", "id": "toolu_1", "name": name, "input": arguments})
        return {"content": bloecke, "stop_reason": "tool_use"}

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
                if self.path.endswith("/api/tags"):
                    self._antwort({"models": [{"name": n} for n in stub.models]})
                    return
                if self.path.endswith("/models"):
                    if stub.fail_with:
                        self._antwort({"error": "abgelehnt"}, status=stub.fail_with)
                        return
                    self._antwort({"data": [{"id": n} for n in stub.models]})
                    return
                self._antwort({"error": "unbekannt"}, status=404)

            def do_POST(self) -> None:  # noqa: N802
                laenge = int(self.headers.get("Content-Length", "0") or 0)
                roh = self.rfile.read(laenge) if laenge else b"{}"
                try:
                    nutzlast = json.loads(roh.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    nutzlast = {}
                stub.requests.append((self.path, nutzlast, dict(self.headers)))

                if stub.fail_times > 0:
                    stub.fail_times -= 1
                    self._antwort({"error": "voruebergehend"}, status=503)
                    return
                if stub.fail_with:
                    self._antwort({"error": "abgelehnt"}, status=stub.fail_with)
                    return
                if stub.reject_tools and nutzlast.get("tools"):
                    self._antwort(
                        {"error": "this model does not support tools"}, status=400
                    )
                    return
                if stub.replies:
                    self._antwort(stub.replies.pop(0))
                    return
                # Ohne vorgegebene Antwort: dem Pfad entsprechend etwas Leeres.
                if "/api/chat" in self.path:
                    self._antwort(stub.ollama_text("ohne Vorgabe"))
                elif "/messages" in self.path:
                    self._antwort(stub.anthropic_text("ohne Vorgabe"))
                else:
                    self._antwort(stub.openai_text("ohne Vorgabe"))

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
