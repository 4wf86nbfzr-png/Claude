"""Stellvertreter fuer einen CalDAV-Server.

Spricht die vier Anfragen, die Jarvis benutzt: PROPFIND (Sammlungen finden),
REPORT (Zeitraum abfragen), PUT (anlegen/aendern), DELETE und GET
(nachlesen). Damit laeuft der Kalenderweg wirklich durch -- einschliesslich
der Regel, dass jede Aenderung beim Anbieter nachgelesen wird.
"""

from __future__ import annotations

import base64
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from xml.sax.saxutils import escape


class CalDavStub:
    def __init__(self, port: int = 8848, user: str = "ich", password: str = "geheim") -> None:
        self.port = port
        self.user = user
        self.password = password
        #: Dateiname -> iCalendar-Text
        self.items: dict[str, str] = {}
        self.requests: list[tuple[str, str]] = []
        self.reject_auth = False
        #: Wenn gesetzt, wird ein PUT angenommen, aber nichts gespeichert --
        #: so laesst sich ein Anbieter nachstellen, der nicht bestaetigt.
        self.swallow_writes = False
        self.collection = "/kalender/privat/"
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}/kalender"

    def add_event(self, name: str, ics: str) -> None:
        self.items[name] = ics

    # ------------------------------------------------------------------
    def start(self) -> str:
        stub = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            # --- Hilfen ---
            def _berechtigt(self) -> bool:
                kopf = self.headers.get("Authorization", "")
                if stub.reject_auth:
                    return False
                if not kopf.startswith("Basic "):
                    return False
                roh = base64.b64decode(kopf[6:]).decode("utf-8", "replace")
                return roh == f"{stub.user}:{stub.password}"

            def _antwort(self, status: int, koerper: str = "",
                         content_type: str = "application/xml; charset=utf-8",
                         extra: dict[str, str] | None = None) -> None:
                daten = koerper.encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(daten)))
                for name, wert in (extra or {}).items():
                    self.send_header(name, wert)
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(daten)

            def _koerper(self) -> str:
                laenge = int(self.headers.get("Content-Length", "0") or 0)
                return self.rfile.read(laenge).decode("utf-8", "replace") if laenge else ""

            def _merken(self) -> str:
                stub.requests.append((self.command, self.path))
                return self._koerper()

            def log_message(self, *args: Any) -> None:
                return

            def _name(self) -> str:
                return self.path.rstrip("/").rsplit("/", 1)[-1]

            # --- Methoden ---
            def do_PROPFIND(self) -> None:  # noqa: N802
                self._merken()
                if not self._berechtigt():
                    self._antwort(401)
                    return
                koerper = (
                    '<?xml version="1.0" encoding="utf-8"?>'
                    '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
                    '<d:response><d:href>/kalender/</d:href><d:propstat><d:prop>'
                    '<d:resourcetype><d:collection/></d:resourcetype>'
                    '<d:displayname>Start</d:displayname>'
                    '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
                    f'<d:response><d:href>{stub.collection}</d:href><d:propstat><d:prop>'
                    '<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>'
                    '<d:displayname>Privat</d:displayname>'
                    '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
                    '<d:response><d:href>/kalender/arbeit/</d:href><d:propstat><d:prop>'
                    '<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>'
                    '<d:displayname>Arbeit</d:displayname>'
                    '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
                    '</d:multistatus>'
                )
                self._antwort(207, koerper)

            def do_REPORT(self) -> None:  # noqa: N802
                anfrage = self._merken()
                if not self._berechtigt():
                    self._antwort(401)
                    return
                bereich = re.search(
                    r'time-range start="(\d{8}T\d{6}Z)" end="(\d{8}T\d{6}Z)"', anfrage
                )
                teile = []
                for name, ics in sorted(stub.items.items()):
                    if bereich and not stub._im_bereich(ics, bereich.group(1), bereich.group(2)):
                        continue
                    teile.append(
                        f'<d:response><d:href>{stub.collection}{name}</d:href>'
                        '<d:propstat><d:prop>'
                        f'<d:getetag>"{hash(ics) & 0xffff}"</d:getetag>'
                        f'<c:calendar-data>{escape(ics)}</c:calendar-data>'
                        '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
                    )
                koerper = (
                    '<?xml version="1.0" encoding="utf-8"?>'
                    '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
                    + "".join(teile) + "</d:multistatus>"
                )
                self._antwort(207, koerper)

            def do_GET(self) -> None:  # noqa: N802
                stub.requests.append((self.command, self.path))
                if not self._berechtigt():
                    self._antwort(401)
                    return
                ics = stub.items.get(self._name())
                if ics is None:
                    self._antwort(404, "nicht gefunden", "text/plain")
                    return
                self._antwort(200, ics, "text/calendar; charset=utf-8",
                              {"ETag": f'"{hash(ics) & 0xffff}"'})

            def do_PUT(self) -> None:  # noqa: N802
                inhalt = self._merken()
                if not self._berechtigt():
                    self._antwort(401)
                    return
                name = self._name()
                if self.headers.get("If-None-Match") == "*" and name in stub.items:
                    self._antwort(412, "existiert bereits", "text/plain")
                    return
                if not stub.swallow_writes:
                    stub.items[name] = inhalt
                self._antwort(201 if name not in stub.items else 204)

            def do_DELETE(self) -> None:  # noqa: N802
                self._merken()
                if not self._berechtigt():
                    self._antwort(401)
                    return
                name = self._name()
                if name not in stub.items:
                    self._antwort(404, "nicht gefunden", "text/plain")
                    return
                if not stub.swallow_writes:
                    del stub.items[name]
                self._antwort(204)

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

    @staticmethod
    def _im_bereich(ics: str, start: str, ende: str) -> bool:
        """Grobe Zeitraumpruefung -- genug fuer einen Stellvertreter."""
        treffer = re.search(r"DTSTART[^:]*:(\d{8})", ics)
        if not treffer:
            return True
        return start[:8] <= treffer.group(1) <= ende[:8]
