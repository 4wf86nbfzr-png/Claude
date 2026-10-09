"""Stellvertreter fuer IMAP und SMTP.

Sprechen genug vom Protokoll, damit die echten Clients aus der
Standardbibliothek (``imaplib``, ``smtplib``) damit arbeiten. Dadurch wird der
E-Mail-Weg wirklich durchlaufen -- Verbindung, Anmeldung, Suche, Abruf,
Kopfzeilen-Dekodierung, Versand -- und nicht nur ein Doppelgaenger geprueft.

Ohne TLS, nur auf ``127.0.0.1``: die Tests sollen keine Zertifikate brauchen.
"""

from __future__ import annotations

import socket
import threading
from email.message import EmailMessage
from typing import Any


def build_message(
    *, from_addr: str, to_addr: str, subject: str, body: str,
    date: str = "Thu, 08 Oct 2026 09:12:00 +0200", message_id: str = "<m1@example.org>",
    html: bool = False,
) -> bytes:
    """Baut eine echte Nachricht (inkl. kodierter Kopfzeilen, wenn noetig)."""
    message = EmailMessage()
    message["From"] = from_addr
    message["To"] = to_addr
    message["Subject"] = subject
    message["Date"] = date
    message["Message-ID"] = message_id
    if html:
        message.set_content("Nur-Text-Teil fehlt absichtlich")
        message.add_alternative(f"<html><body><p>{body}</p></body></html>", subtype="html")
        # Den Nur-Text-Teil entfernen, damit der HTML-Weg geprueft wird.
        message.set_payload(message.get_payload()[1:])
    else:
        message.set_content(body)
    return message.as_bytes()


class ImapStub:
    """Minimaler IMAP4-Server: LOGIN, EXAMINE/SELECT, UID SEARCH, UID FETCH."""

    def __init__(self, port: int = 8845, user: str = "ich@example.org",
                 password: str = "geheim") -> None:
        self.port = port
        self.user = user
        self.password = password
        #: uid -> (rohdaten, ungelesen)
        self.messages: dict[int, tuple[bytes, bool]] = {}
        self.commands: list[str] = []
        self.reject_login = False
        self._server: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def add(self, raw: bytes, *, unread: bool = True) -> int:
        uid = max(self.messages, default=0) + 1
        self.messages[uid] = (raw, unread)
        return uid

    # ------------------------------------------------------------------
    def start(self) -> None:
        self._server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server.bind(("127.0.0.1", self.port))
        self._server.listen(5)
        self._server.settimeout(0.3)
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=3)
        if self._server is not None:
            self._server.close()
            self._server = None

    def _serve(self) -> None:
        while not self._stop.is_set():
            try:
                verbindung, _ = self._server.accept()  # type: ignore[union-attr]
            except (TimeoutError, OSError):
                continue
            threading.Thread(target=self._session, args=(verbindung,), daemon=True).start()

    # ------------------------------------------------------------------
    def _session(self, verbindung: socket.socket) -> None:
        verbindung.settimeout(5)
        datei = verbindung.makefile("rwb")
        self._send(datei, "* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] Jarvis-Teststellvertreter")
        try:
            while True:
                zeile = datei.readline()
                if not zeile:
                    return
                text = zeile.decode("utf-8", "replace").strip()
                if not text:
                    continue
                self.commands.append(text)
                marke, _, rest = text.partition(" ")
                befehl, _, argumente = rest.partition(" ")
                befehl = befehl.upper()
                if befehl == "CAPABILITY":
                    self._send(datei, "* CAPABILITY IMAP4rev1 AUTH=PLAIN")
                    self._send(datei, f"{marke} OK CAPABILITY completed")
                elif befehl == "LOGIN":
                    if self.reject_login:
                        self._send(datei, f"{marke} NO [AUTHENTICATIONFAILED] falsch")
                    else:
                        self._send(datei, f"{marke} OK LOGIN completed")
                elif befehl in {"SELECT", "EXAMINE"}:
                    self._send(datei, f"* {len(self.messages)} EXISTS")
                    self._send(datei, "* 0 RECENT")
                    self._send(datei, "* OK [UIDVALIDITY 1] UIDs gueltig")
                    zusatz = "[READ-ONLY]" if befehl == "EXAMINE" else "[READ-WRITE]"
                    self._send(datei, f"{marke} OK {zusatz} {befehl} completed")
                elif befehl == "UID":
                    self._uid(datei, marke, argumente)
                elif befehl == "CLOSE":
                    self._send(datei, f"{marke} OK CLOSE completed")
                elif befehl == "LOGOUT":
                    self._send(datei, "* BYE bis dann")
                    self._send(datei, f"{marke} OK LOGOUT completed")
                    return
                elif befehl == "NOOP":
                    self._send(datei, f"{marke} OK NOOP completed")
                else:
                    self._send(datei, f"{marke} BAD unbekannt: {befehl}")
        except (TimeoutError, OSError, ValueError):
            return
        finally:
            try:
                datei.close()
                verbindung.close()
            except OSError:
                pass

    def _uid(self, datei: Any, marke: str, argumente: str) -> None:
        unterbefehl, _, rest = argumente.partition(" ")
        unterbefehl = unterbefehl.upper()

        if unterbefehl == "SEARCH":
            kriterium = rest.upper()
            if "UNSEEN" in kriterium:
                treffer = [uid for uid, (_, ungelesen) in sorted(self.messages.items())
                           if ungelesen]
            else:
                treffer = sorted(self.messages)
            if "SUBJECT" in kriterium or "FROM" in kriterium:
                # Suchwort zwischen Anfuehrungszeichen herausziehen.
                teile = [t for t in rest.split('"') if t.strip()]
                wort = teile[1].lower() if len(teile) > 1 else ""
                if wort:
                    treffer = [
                        uid for uid in treffer
                        if wort in self.messages[uid][0].decode("utf-8", "replace").lower()
                    ]
            self._send(datei, "* SEARCH " + " ".join(str(u) for u in treffer))
            self._send(datei, f"{marke} OK UID SEARCH completed")
            return

        if unterbefehl == "FETCH":
            uid_teil, _, teile = rest.partition(" ")
            try:
                uid = int(uid_teil.split(":")[0])
            except ValueError:
                self._send(datei, f"{marke} BAD uid")
                return
            eintrag = self.messages.get(uid)
            if eintrag is None:
                self._send(datei, f"{marke} OK UID FETCH completed")
                return
            roh, ungelesen = eintrag
            flags = "" if ungelesen else "\\Seen"
            nutzlast = roh if "HEADER.FIELDS" not in teile.upper() else self._headers(roh)
            self._send_literal(datei, uid, flags, nutzlast,
                               nur_kopf="HEADER.FIELDS" in teile.upper())
            self._send(datei, f"{marke} OK UID FETCH completed")
            return

        self._send(datei, f"{marke} BAD unbekannt")

    @staticmethod
    def _headers(roh: bytes) -> bytes:
        kopf, _, _ = roh.partition(b"\r\n\r\n")
        if not kopf:
            kopf = roh.split(b"\n\n", 1)[0]
        return kopf.replace(b"\n", b"\r\n") + b"\r\n\r\n"

    @staticmethod
    def _send(datei: Any, zeile: str) -> None:
        datei.write(zeile.encode("utf-8") + b"\r\n")
        datei.flush()

    @staticmethod
    def _send_literal(datei: Any, uid: int, flags: str, nutzlast: bytes,
                      *, nur_kopf: bool) -> None:
        teil = "BODY[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)]" if nur_kopf else "BODY[]"
        kopf = (f"* {uid} FETCH (UID {uid} FLAGS ({flags}) "
                f"{teil} {{{len(nutzlast)}}}").encode("utf-8")
        datei.write(kopf + b"\r\n")
        datei.write(nutzlast)
        datei.write(b")\r\n")
        datei.flush()


class SmtpStub:
    """Minimaler SMTP-Server ohne TLS: EHLO, AUTH LOGIN, MAIL, RCPT, DATA."""

    def __init__(self, port: int = 8846, user: str = "ich@example.org",
                 password: str = "geheim") -> None:
        self.port = port
        self.user = user
        self.password = password
        #: Angenommene Nachrichten als (Absender, Empfaenger, Rohtext).
        self.received: list[tuple[str, list[str], str]] = []
        self.reject_auth = False
        self.reject_data = False
        self._server: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self) -> None:
        self._server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server.bind(("127.0.0.1", self.port))
        self._server.listen(5)
        self._server.settimeout(0.3)
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=3)
        if self._server is not None:
            self._server.close()
            self._server = None

    def _serve(self) -> None:
        while not self._stop.is_set():
            try:
                verbindung, _ = self._server.accept()  # type: ignore[union-attr]
            except (TimeoutError, OSError):
                continue
            threading.Thread(target=self._session, args=(verbindung,), daemon=True).start()

    def _session(self, verbindung: socket.socket) -> None:
        verbindung.settimeout(5)
        datei = verbindung.makefile("rwb")
        absender = ""
        empfaenger: list[str] = []

        def sende(zeile: str) -> None:
            datei.write(zeile.encode("utf-8") + b"\r\n")
            datei.flush()

        sende("220 127.0.0.1 Jarvis-Teststellvertreter")
        try:
            while True:
                zeile = datei.readline()
                if not zeile:
                    return
                text = zeile.decode("utf-8", "replace").strip()
                gross = text.upper()
                if gross.startswith("EHLO") or gross.startswith("HELO"):
                    sende("250-127.0.0.1")
                    sende("250-AUTH LOGIN PLAIN")
                    sende("250 HELP")
                elif gross.startswith("AUTH LOGIN"):
                    if self.reject_auth:
                        sende("535 Authentifizierung fehlgeschlagen")
                        continue
                    sende("334 VXNlcm5hbWU6")
                    datei.readline()
                    sende("334 UGFzc3dvcmQ6")
                    datei.readline()
                    sende("235 angemeldet")
                elif gross.startswith("MAIL FROM"):
                    absender = text.split(":", 1)[1].strip().strip("<>")
                    sende("250 OK")
                elif gross.startswith("RCPT TO"):
                    empfaenger.append(text.split(":", 1)[1].strip().strip("<>"))
                    sende("250 OK")
                elif gross == "DATA":
                    if self.reject_data:
                        sende("554 abgelehnt")
                        continue
                    sende("354 Daten, Ende mit <CRLF>.<CRLF>")
                    zeilen: list[str] = []
                    while True:
                        inhalt = datei.readline().decode("utf-8", "replace")
                        if inhalt.strip() == "." or not inhalt:
                            break
                        zeilen.append(inhalt)
                    self.received.append((absender, list(empfaenger), "".join(zeilen)))
                    empfaenger.clear()
                    sende("250 OK angenommen")
                elif gross == "QUIT":
                    sende("221 bis dann")
                    return
                elif gross == "RSET":
                    empfaenger.clear()
                    sende("250 OK")
                elif gross.startswith("STARTTLS"):
                    sende("454 TLS nicht verfuegbar")
                else:
                    sende("250 OK")
        except (TimeoutError, OSError, ValueError):
            return
        finally:
            try:
                datei.close()
                verbindung.close()
            except OSError:
                pass
