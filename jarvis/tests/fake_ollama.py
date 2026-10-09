"""Ein echter kleiner HTTP-Dienst, der Ollama nachspielt.

Bewusst ein richtiger Server auf einem Port statt eines ausgetauschten
``urlopen``: so wird auch das Streamen zeilenweiser JSON-Antworten, das
Schliessen der Verbindung beim Abbruch und das Zeitverhalten wirklich geprueft.
"""

from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class FakeOllama:
    def __init__(self, *, chunks: list[dict] | None = None,
                 models: list[str] | None = None,
                 status: int = 200, error: str | None = None,
                 delay: float = 0.0, hang: bool = False) -> None:
        self.chunks = chunks if chunks is not None else [
            {"message": {"content": "Moin"}, "done": False},
            {"message": {"content": " Noah."}, "done": True},
        ]
        self.models = models if models is not None else ["qwen2.5:7b-instruct"]
        self.status = status
        self.error = error
        self.delay = delay
        self.hang = hang
        self.requests: list[dict] = []
        #: Zaehlt, wie viele Stuecke wirklich geschrieben wurden -- damit ein
        #: Test sehen kann, dass nach dem Abbruch nichts mehr floss.
        self.written = 0
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def base_url(self) -> str:
        assert self._server is not None
        return f"http://127.0.0.1:{self._server.server_port}"

    def __enter__(self) -> "FakeOllama":
        aussen = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args):  # Testausgabe ruhig halten
                pass

            def do_GET(self):  # noqa: N802
                if self.path != "/api/tags":
                    self.send_error(404)
                    return
                koerper = json.dumps(
                    {"models": [{"name": n} for n in aussen.models]}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(koerper)))
                self.end_headers()
                self.wfile.write(koerper)

            def do_POST(self):  # noqa: N802
                laenge = int(self.headers.get("Content-Length", 0))
                roh = self.rfile.read(laenge)
                aussen.requests.append(json.loads(roh) if roh else {})

                if aussen.status != 200:
                    self.send_error(aussen.status, "Testfehler")
                    return
                if aussen.hang:
                    time.sleep(30)  # laeuft in die Zeitueberschreitung des Clients
                    return

                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson")
                self.send_header("Transfer-Encoding", "chunked")
                self.end_headers()
                try:
                    for stueck in aussen.chunks:
                        if aussen.delay:
                            time.sleep(aussen.delay)
                        self._write_chunk(json.dumps(stueck).encode() + b"\n")
                        aussen.written += 1
                    self._write_chunk(b"")  # Abschluss
                except (BrokenPipeError, ConnectionResetError):
                    # Der Client hat abgebrochen -- genau das wollen wir pruefen.
                    pass

            def _write_chunk(self, daten: bytes) -> None:
                self.wfile.write(f"{len(daten):X}\r\n".encode())
                self.wfile.write(daten + b"\r\n")
                self.wfile.flush()

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._server.daemon_threads = True
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *_exc) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)
