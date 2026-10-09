"""Stellvertreter fuer die Twilio-REST-Schnittstelle.

Nimmt Anrufe an wie Twilio, merkt sich das uebergebene TwiML und kann
Fehlerfaelle vortaeuschen (abgelehnte Zugangsdaten, gesperrtes Konto). So
laesst sich der Telefonieweg vollstaendig pruefen, ohne dass jemand angerufen
wird und ohne dass es etwas kostet.
"""

from __future__ import annotations

import json
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


class TwilioStub:
    def __init__(self, port: int = 8843, account_sid: str = "ACtest", auth_token: str = "tok") -> None:
        self.port = port
        self.account_sid = account_sid
        self.auth_token = auth_token
        #: Jeder angenommene Anruf als Formulardaten (To, From, Twiml/Url ...).
        self.calls: list[dict[str, str]] = []
        #: Was per POST auf eine bestehende Verbindung ging (z. B. Auflegen).
        self.updates: list[tuple[str, dict[str, str]]] = []
        self.status_code = 201
        self.fail_with: int | None = None
        self.next_status = "queued"
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}/2010-04-01"

    def last_twiml(self) -> str:
        return self.calls[-1].get("Twiml", "") if self.calls else ""

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
                if stub.fail_with:
                    self._antwort({"message": "abgelehnt"}, status=stub.fail_with)
                    return
                if self.path.endswith(f"/Accounts/{stub.account_sid}.json"):
                    self._antwort({"friendly_name": "Testkonto", "status": "active",
                                   "sid": stub.account_sid})
                    return
                if "/Calls/" in self.path:
                    self._antwort({"sid": "CAtest", "status": "completed"})
                    return
                self._antwort({"message": "unbekannt"}, status=404)

            def do_POST(self) -> None:  # noqa: N802
                laenge = int(self.headers.get("Content-Length", "0") or 0)
                roh = self.rfile.read(laenge).decode("utf-8", "replace") if laenge else ""
                felder = {k: v[0] for k, v in urllib.parse.parse_qs(roh).items()}

                if stub.fail_with:
                    self._antwort({"message": "abgelehnt", "code": 21210},
                                  status=stub.fail_with)
                    return

                if self.path.endswith("/Calls.json"):
                    stub.calls.append(felder)
                    self._antwort({
                        "sid": f"CA{len(stub.calls):032d}", "status": stub.next_status,
                        "to": felder.get("To", ""), "from": felder.get("From", ""),
                    }, status=stub.status_code)
                    return
                if "/Calls/" in self.path:
                    stub.updates.append((self.path, felder))
                    self._antwort({"sid": "CAtest", "status": felder.get("Status", "")})
                    return
                self._antwort({"message": "unbekannt"}, status=404)

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
