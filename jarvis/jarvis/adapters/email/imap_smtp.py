"""E-Mail ueber IMAP und SMTP.

Funktioniert mit jedem Anbieter, der diese Protokolle spricht (das Postfach
bei hst-hospitality.com, Gmail mit App-Passwort, iCloud, mailbox.org ...).
Beides kommt aus der Standardbibliothek, also keine zusaetzliche
Abhaengigkeit.

Die blockierenden Aufrufe laufen in einem Thread (``asyncio.to_thread``),
damit der Telegram-Adapter waehrenddessen antwortet.

Grenze, die eingehalten wird: **Lesen, Suchen, Zusammenfassen und Entwuerfe
schreiben** macht Jarvis selbst. **Versenden** passiert nur nach einer
ausdruecklichen Bestaetigung -- siehe ``core.permissions``.
"""

from __future__ import annotations

import asyncio
import email
import email.policy
import imaplib
import logging
import re
import smtplib
import ssl
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import formataddr, getaddresses, parsedate_to_datetime
from typing import Any

from ...errors import CredentialsMissing, ExternalServiceError

log = logging.getLogger(__name__)

MAX_BODY = 20000


@dataclass(slots=True)
class MailSummary:
    uid: str
    from_addr: str
    from_name: str
    subject: str
    date: datetime | None
    snippet: str
    unread: bool = True
    message_id: str = ""
    to_addr: str = ""
    body: str = ""
    important: bool = False
    reasons: list[str] = field(default_factory=list)

    def line(self) -> str:
        who = self.from_name or self.from_addr
        when = self.date.strftime("%d.%m. %H:%M") if self.date else ""
        mark = "❗" if self.important else "•"
        return f"{mark} {who} — {self.subject or '(kein Betreff)'} ({when})"

    def as_dict(self) -> dict[str, Any]:
        return {
            "uid": self.uid, "von": self.from_addr, "name": self.from_name,
            "betreff": self.subject,
            "datum": self.date.isoformat() if self.date else "",
            "auszug": self.snippet[:400], "ungelesen": self.unread,
            "wichtig": self.important, "gruende": self.reasons,
        }


def _decode(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value))).strip()
    except Exception:
        return str(value).strip()


def _plain_body(message: email.message.Message) -> str:
    """Textteil einer Nachricht; HTML wird grob entschlackt."""
    if message.is_multipart():
        for part in message.walk():
            if part.get_content_type() == "text/plain" and "attachment" not in str(
                part.get("Content-Disposition", "")
            ):
                try:
                    return part.get_content()
                except Exception:
                    payload = part.get_payload(decode=True) or b""
                    return payload.decode(part.get_content_charset() or "utf-8", "replace")
        for part in message.walk():
            if part.get_content_type() == "text/html":
                payload = part.get_payload(decode=True) or b""
                html = payload.decode(part.get_content_charset() or "utf-8", "replace")
                return _strip_html(html)
        return ""
    try:
        content = message.get_content()
    except Exception:
        payload = message.get_payload(decode=True) or b""
        content = payload.decode(message.get_content_charset() or "utf-8", "replace")
    if message.get_content_type() == "text/html":
        return _strip_html(content)
    return content


def _strip_html(html: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)
    text = re.sub(r"(?i)<br\s*/?>|</p>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"[ \t]{2,}", " ", text).strip()


class EmailAdapter:
    def __init__(
        self, *, imap_host: str, imap_port: int, imap_user: str, imap_password: str,
        imap_folder: str = "INBOX", smtp_host: str = "", smtp_port: int = 587,
        smtp_user: str = "", smtp_password: str = "", smtp_starttls: bool = True,
        from_addr: str = "", important_senders: list[str] | None = None,
        important_keywords: list[str] | None = None, timeout: float = 30.0,
    ) -> None:
        if not (imap_host and imap_user and imap_password):
            raise CredentialsMissing(
                "Das E-Mail-Konto ist noch nicht verbunden.",
                hint="IMAP_HOST, IMAP_USER und IMAP_PASSWORD in der .env setzen.",
            )
        self.imap_host = imap_host
        self.imap_port = imap_port
        self.imap_user = imap_user
        self.imap_password = imap_password
        self.folder = imap_folder or "INBOX"
        self.smtp_host = smtp_host or imap_host.replace("imap", "smtp")
        self.smtp_port = smtp_port
        self.smtp_user = smtp_user or imap_user
        self.smtp_password = smtp_password or imap_password
        self.smtp_starttls = smtp_starttls
        self.from_addr = from_addr or imap_user
        self.important_senders = [s.lower() for s in (important_senders or [])]
        self.important_keywords = [k.lower() for k in (important_keywords or [])]
        self.timeout = timeout

    # --- Verbindung -------------------------------------------------------
    def _connect(self) -> imaplib.IMAP4_SSL:
        try:
            context = ssl.create_default_context()
            connection = imaplib.IMAP4_SSL(
                self.imap_host, self.imap_port, ssl_context=context, timeout=self.timeout
            )
            connection.login(self.imap_user, self.imap_password)
        except imaplib.IMAP4.error as exc:
            raise CredentialsMissing(
                "Das Postfach hat die Anmeldung abgelehnt.",
                hint="Bei Gmail/iCloud ein App-Passwort verwenden, nicht das Kontopasswort.",
            ) from exc
        except (OSError, ssl.SSLError) as exc:
            raise ExternalServiceError(
                f"Der Mailserver {self.imap_host} ist nicht erreichbar: {type(exc).__name__}"
            ) from exc
        return connection

    # --- Lesen ------------------------------------------------------------
    def _fetch_sync(
        self, *, unread_only: bool, limit: int, search: str = "", with_body: bool = False,
        since_uid: str = "",
    ) -> list[MailSummary]:
        connection = self._connect()
        try:
            status, _ = connection.select(self.folder, readonly=True)
            if status != "OK":
                raise ExternalServiceError(f"Ordner '{self.folder}' nicht gefunden.")
            criteria = ["UNSEEN"] if unread_only else ["ALL"]
            if search:
                safe = search.replace('"', "'")
                criteria = ["OR", f'SUBJECT "{safe}"', f'FROM "{safe}"'] if not unread_only else \
                    ["UNSEEN", "OR", f'SUBJECT "{safe}"', f'FROM "{safe}"']
            if since_uid and since_uid.isdigit():
                status, data = connection.uid("SEARCH", None, f"UID {int(since_uid) + 1}:*")
            else:
                status, data = connection.uid("SEARCH", None, *criteria)
            if status != "OK":
                raise ExternalServiceError("Die Suche im Postfach ist fehlgeschlagen.")
            uids = (data[0] or b"").split()
            uids = uids[-limit:] if limit else uids

            results: list[MailSummary] = []
            for uid in reversed(uids):
                parts = "(FLAGS BODY.PEEK[])" if with_body else \
                    "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)])"
                status, payload = connection.uid("FETCH", uid, parts)
                if status != "OK" or not payload or not isinstance(payload[0], tuple):
                    continue
                flags = b""
                for element in payload:
                    if isinstance(element, bytes):
                        flags += element
                    elif isinstance(element, tuple):
                        flags += element[0] or b""
                raw = payload[0][1]
                message = email.message_from_bytes(raw, policy=email.policy.default)
                summary = self._summarize(uid.decode(), message, flags, with_body=with_body)
                results.append(summary)
            return results
        finally:
            try:
                connection.close()
            except Exception:
                pass
            try:
                connection.logout()
            except Exception:
                pass

    def _summarize(
        self, uid: str, message: email.message.Message, flags: bytes, *, with_body: bool
    ) -> MailSummary:
        from_raw = _decode(message.get("From"))
        addresses = getaddresses([from_raw]) or [("", from_raw)]
        name, addr = addresses[0]
        subject = _decode(message.get("Subject"))
        try:
            date = parsedate_to_datetime(message.get("Date")) if message.get("Date") else None
            if date and date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            date = None
        body = _plain_body(message)[:MAX_BODY] if with_body else ""
        snippet = re.sub(r"\s+", " ", (body or "")).strip()[:400]
        summary = MailSummary(
            uid=uid, from_addr=addr or from_raw, from_name=name, subject=subject,
            date=date, snippet=snippet, unread=b"\\Seen" not in flags,
            message_id=_decode(message.get("Message-ID")),
            to_addr=_decode(message.get("To")), body=body,
        )
        summary.important, summary.reasons = self.rate_importance(summary)
        return summary

    def rate_importance(self, mail: MailSummary) -> tuple[bool, list[str]]:
        """Einfache, nachvollziehbare Einstufung -- keine Magie."""
        reasons: list[str] = []
        sender = (mail.from_addr or "").lower()
        subject = (mail.subject or "").lower()
        if any(s and s in sender for s in self.important_senders):
            reasons.append("Absender ist als wichtig hinterlegt")
        if any(k and k in subject for k in self.important_keywords):
            reasons.append("Stichwort im Betreff")
        if any(word in subject for word in ("dringend", "wichtig", "sofort", "frist", "mahnung",
                                            "rechnung", "kuendigung", "absage", "krank")):
            reasons.append("dringliche Formulierung im Betreff")
        return bool(reasons), reasons

    async def fetch_unread(self, limit: int = 10, with_body: bool = False) -> list[MailSummary]:
        return await asyncio.to_thread(
            self._fetch_sync, unread_only=True, limit=limit, with_body=with_body
        )

    async def fetch_recent(self, limit: int = 10, with_body: bool = False) -> list[MailSummary]:
        return await asyncio.to_thread(
            self._fetch_sync, unread_only=False, limit=limit, with_body=with_body
        )

    async def search(self, query: str, limit: int = 10) -> list[MailSummary]:
        return await asyncio.to_thread(
            self._fetch_sync, unread_only=False, limit=limit, search=query, with_body=False
        )

    async def fetch_one(self, uid: str) -> MailSummary | None:
        def work() -> MailSummary | None:
            connection = self._connect()
            try:
                connection.select(self.folder, readonly=True)
                status, payload = connection.uid("FETCH", uid, "(FLAGS BODY.PEEK[])")
                if status != "OK" or not payload or not isinstance(payload[0], tuple):
                    return None
                message = email.message_from_bytes(payload[0][1], policy=email.policy.default)
                return self._summarize(uid, message, payload[0][0] or b"", with_body=True)
            finally:
                try:
                    connection.close()
                    connection.logout()
                except Exception:
                    pass
        return await asyncio.to_thread(work)

    # --- Senden (nur nach Bestaetigung) -----------------------------------
    def _send_sync(
        self, to_addr: str, subject: str, body: str, *, in_reply_to: str = "", cc: str = "",
    ) -> str:
        message = EmailMessage()
        message["From"] = formataddr(("", self.from_addr))
        message["To"] = to_addr
        if cc:
            message["Cc"] = cc
        message["Subject"] = subject
        if in_reply_to:
            message["In-Reply-To"] = in_reply_to
            message["References"] = in_reply_to
        message.set_content(body)
        try:
            context = ssl.create_default_context()
            if self.smtp_port == 465:
                server = smtplib.SMTP_SSL(
                    self.smtp_host, self.smtp_port, timeout=self.timeout, context=context
                )
            else:
                server = smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=self.timeout)
            with server:
                if self.smtp_port != 465 and self.smtp_starttls:
                    server.starttls(context=context)
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(message)
        except smtplib.SMTPAuthenticationError as exc:
            raise CredentialsMissing(
                "Der Mailserver hat die Anmeldung zum Senden abgelehnt.",
                hint="SMTP_USER/SMTP_PASSWORD pruefen (oft ein App-Passwort).",
            ) from exc
        except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
            raise ExternalServiceError(
                f"Die Nachricht wurde nicht versendet: {type(exc).__name__}: {exc}"
            ) from exc
        return message.get("Message-ID") or ""

    async def send(
        self, to_addr: str, subject: str, body: str, *, in_reply_to: str = "", cc: str = "",
    ) -> str:
        """Versendet tatsaechlich. Darf nur aus einem bestaetigten Vorgang gerufen werden."""
        message_id = await asyncio.to_thread(
            self._send_sync, to_addr, subject, body, in_reply_to=in_reply_to, cc=cc
        )
        log.info("E-Mail an %s versendet (%s)", to_addr, subject[:60])
        return message_id

    # --- Zustand ----------------------------------------------------------
    async def health(self) -> tuple[bool, str]:
        def work() -> tuple[bool, str]:
            try:
                connection = self._connect()
            except (CredentialsMissing, ExternalServiceError) as exc:
                return False, exc.message
            try:
                status, data = connection.select(self.folder, readonly=True)
                if status != "OK":
                    return False, f"Ordner '{self.folder}' nicht vorhanden"
                total = int((data[0] or b"0").decode() or 0)
                status, unseen = connection.uid("SEARCH", None, "UNSEEN")
                count = len((unseen[0] or b"").split()) if status == "OK" else 0
                return True, f"Postfach {self.imap_user} erreichbar, {count} ungelesen von {total}"
            finally:
                try:
                    connection.close()
                    connection.logout()
                except Exception:
                    pass
        return await asyncio.to_thread(work)
