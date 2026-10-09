"""CalDAV-Kalender (Apple iCloud, Nextcloud, Mailbox.org, Synology ...).

Bewusst ohne Fremdbibliothek: CalDAV ist HTTP mit XML, und die vier
Anfragen, die wir brauchen (PROPFIND, REPORT, PUT, DELETE), sind kurz.
Das haelt die Abhaengigkeiten klein und macht Fehler nachvollziehbar.

Jede Aenderung wird per GET nachgelesen, bevor sie als erfolgreich gilt.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from xml.etree import ElementTree

import httpx

from ...errors import CredentialsMissing, ExternalServiceError
from .base import CalendarAdapter, CalendarEvent

log = logging.getLogger(__name__)

NS = {"d": "DAV:", "c": "urn:ietf:params:xml:ns:caldav"}

_PROPFIND_CALENDARS = """<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop>
</d:propfind>"""


def _report_range(start: datetime, end: datetime) -> str:
    fmt = "%Y%m%dT%H%M%SZ"
    return f"""<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="{start.strftime(fmt)}" end="{end.strftime(fmt)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>"""


def _escape(text: str) -> str:
    return (
        (text or "").replace("\\", "\\\\").replace(";", "\\;")
        .replace(",", "\\,").replace("\n", "\\n")
    )


def _unescape(text: str) -> str:
    return (
        (text or "").replace("\\n", "\n").replace("\\,", ",")
        .replace("\\;", ";").replace("\\\\", "\\")
    )


def _unfold(raw: str) -> list[str]:
    """iCalendar faltet lange Zeilen -- Fortsetzungen beginnen mit Leerzeichen."""
    lines: list[str] = []
    for line in raw.replace("\r\n", "\n").split("\n"):
        if line[:1] in (" ", "\t") and lines:
            lines[-1] += line[1:]
        else:
            lines.append(line)
    return lines


def _parse_ical_datetime(value: str, parameters: str = "") -> tuple[datetime, bool]:
    value = value.strip()
    all_day = "VALUE=DATE" in parameters.upper() and "DATE-TIME" not in parameters.upper()
    try:
        if all_day or (len(value) == 8 and value.isdigit()):
            moment = datetime.strptime(value, "%Y%m%d").replace(tzinfo=timezone.utc)
            return moment, True
        if value.endswith("Z"):
            return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc), False
        tz_match = re.search(r"TZID=([^;:]+)", parameters)
        naive = datetime.strptime(value[:15], "%Y%m%dT%H%M%S")
        if tz_match:
            from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
            try:
                return naive.replace(tzinfo=ZoneInfo(tz_match.group(1))).astimezone(timezone.utc), False
            except ZoneInfoNotFoundError:
                pass
        return naive.replace(tzinfo=timezone.utc), False
    except ValueError as exc:
        raise ExternalServiceError(f"Unlesbare Zeitangabe im Kalender: {value}") from exc


def parse_vevent(ical: str, *, href: str = "", etag: str = "") -> CalendarEvent | None:
    """Liest das erste VEVENT aus einem iCalendar-Datensatz."""
    inside = False
    fields: dict[str, tuple[str, str]] = {}
    for line in _unfold(ical):
        upper = line.upper()
        if upper.startswith("BEGIN:VEVENT"):
            inside = True
            continue
        if upper.startswith("END:VEVENT"):
            break
        if not inside or ":" not in line:
            continue
        head, _, value = line.partition(":")
        name, _, parameters = head.partition(";")
        fields[name.upper()] = (value, parameters)

    if "DTSTART" not in fields:
        return None
    start, all_day = _parse_ical_datetime(*fields["DTSTART"])
    if "DTEND" in fields:
        end, _ = _parse_ical_datetime(*fields["DTEND"])
    elif "DURATION" in fields:
        end = start + _parse_duration(fields["DURATION"][0])
    else:
        end = start + (timedelta(days=1) if all_day else timedelta(hours=1))
    return CalendarEvent(
        uid=fields.get("UID", (href or uuid.uuid4().hex, ""))[0],
        title=_unescape(fields.get("SUMMARY", ("(ohne Titel)", ""))[0]),
        start=start, end=end, all_day=all_day,
        location=_unescape(fields.get("LOCATION", ("", ""))[0]),
        description=_unescape(fields.get("DESCRIPTION", ("", ""))[0]),
        provider="caldav", etag=etag, extra={"href": href},
    )


def _parse_duration(value: str) -> timedelta:
    match = re.match(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", value.strip())
    if not match:
        return timedelta(hours=1)
    days, hours, minutes, seconds = (int(g or 0) for g in match.groups())
    return timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds)


def build_vevent(event: CalendarEvent) -> str:
    fmt = "%Y%m%dT%H%M%SZ"
    stamp = datetime.now(timezone.utc).strftime(fmt)
    if event.all_day:
        start_line = f"DTSTART;VALUE=DATE:{event.start.strftime('%Y%m%d')}"
        end_line = f"DTEND;VALUE=DATE:{event.end.strftime('%Y%m%d')}"
    else:
        start_line = f"DTSTART:{event.start.astimezone(timezone.utc).strftime(fmt)}"
        end_line = f"DTEND:{event.end.astimezone(timezone.utc).strftime(fmt)}"
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jarvis//Assistent//DE",
        "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
        f"UID:{event.uid}", f"DTSTAMP:{stamp}", start_line, end_line,
        f"SUMMARY:{_escape(event.title)}",
    ]
    if event.location:
        lines.append(f"LOCATION:{_escape(event.location)}")
    if event.description:
        lines.append(f"DESCRIPTION:{_escape(event.description)}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"


class CalDAVCalendar(CalendarAdapter):
    name = "caldav"

    def __init__(
        self, url: str, user: str, password: str, *, calendar: str = "", timeout: float = 30.0
    ) -> None:
        if not (url and user and password):
            raise CredentialsMissing(
                "Fuer CalDAV fehlen Zugangsdaten.",
                hint="CALDAV_URL, CALDAV_USER und CALDAV_PASSWORD setzen.",
            )
        self.base_url = url.rstrip("/")
        self.user = user
        self.password = password
        self.calendar_name = calendar
        self.timeout = timeout
        self._collection: str | None = None
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self.timeout, auth=(self.user, self.password), follow_redirects=True,
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        try:
            response = await self._http().request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Der Kalenderserver ist nicht erreichbar: {type(exc).__name__}"
            ) from exc
        if response.status_code in (401, 403):
            raise CredentialsMissing(
                "Der Kalenderserver hat die Anmeldung abgelehnt.",
                hint="Bei iCloud/Google braucht es ein app-spezifisches Passwort.",
            )
        return response

    async def collection_url(self) -> str:
        """Findet die Kalendersammlung, in die geschrieben wird."""
        if self._collection:
            return self._collection
        response = await self._request(
            "PROPFIND", self.base_url, content=_PROPFIND_CALENDARS,
            headers={"Depth": "1", "Content-Type": "application/xml; charset=utf-8"},
        )
        if response.status_code >= 400:
            # Manche Server liefern die Sammlung direkt unter der angegebenen URL.
            self._collection = self.base_url + "/"
            return self._collection
        root = ElementTree.fromstring(response.text)
        candidates: list[tuple[str, str]] = []
        for entry in root.findall("d:response", NS):
            href = (entry.findtext("d:href", default="", namespaces=NS) or "").strip()
            is_calendar = entry.find(".//c:calendar", NS) is not None
            name = entry.findtext(".//d:displayname", default="", namespaces=NS) or ""
            if href and is_calendar:
                candidates.append((href, name))
        if not candidates:
            self._collection = self.base_url + "/"
            return self._collection
        chosen = candidates[0][0]
        if self.calendar_name:
            for href, name in candidates:
                if self.calendar_name.lower() in (name or "").lower() or \
                        self.calendar_name.lower() in href.lower():
                    chosen = href
                    break
        self._collection = httpx.URL(self.base_url).join(chosen).__str__()
        log.info("CalDAV-Sammlung: %s", self._collection)
        return self._collection

    async def list_events(self, start: datetime, end: datetime) -> list[CalendarEvent]:
        collection = await self.collection_url()
        response = await self._request(
            "REPORT", collection, content=_report_range(start, end),
            headers={"Depth": "1", "Content-Type": "application/xml; charset=utf-8"},
        )
        if response.status_code >= 400:
            raise ExternalServiceError(
                f"Der Kalender antwortet mit Fehler {response.status_code}."
            )
        events: list[CalendarEvent] = []
        root = ElementTree.fromstring(response.text)
        for entry in root.findall("d:response", NS):
            href = (entry.findtext("d:href", default="", namespaces=NS) or "").strip()
            etag = (entry.findtext(".//d:getetag", default="", namespaces=NS) or "").strip('"')
            data = entry.findtext(".//c:calendar-data", default="", namespaces=NS) or ""
            if not data:
                continue
            event = parse_vevent(data, href=href, etag=etag)
            if event is not None:
                event.calendar_id = self.calendar_name or collection
                events.append(event)
        events.sort(key=lambda e: e.start)
        return events

    async def get_event(self, uid: str) -> CalendarEvent | None:
        collection = await self.collection_url()
        response = await self._request("GET", f"{collection.rstrip('/')}/{uid}.ics")
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            # Fallback: im Zeitfenster suchen (manche Server nutzen andere Dateinamen).
            window_start = datetime.now(timezone.utc) - timedelta(days=365)
            window_end = datetime.now(timezone.utc) + timedelta(days=365)
            for event in await self.list_events(window_start, window_end):
                if event.uid == uid:
                    return event
            return None
        return parse_vevent(response.text, etag=response.headers.get("ETag", "").strip('"'))

    async def create_event(self, event: CalendarEvent) -> CalendarEvent:
        collection = await self.collection_url()
        uid = event.uid or f"jarvis-{uuid.uuid4().hex[:16]}"
        event.uid = uid
        response = await self._request(
            "PUT", f"{collection.rstrip('/')}/{uid}.ics",
            content=build_vevent(event).encode("utf-8"),
            headers={"Content-Type": "text/calendar; charset=utf-8", "If-None-Match": "*"},
        )
        if response.status_code >= 400:
            raise ExternalServiceError(
                f"Der Termin wurde nicht angelegt (Fehler {response.status_code})."
            )
        confirmed = await self.get_event(uid)
        if confirmed is None:
            raise ExternalServiceError(
                "Der Kalenderserver hat den Termin nicht bestaetigt. "
                "Ich habe ihn deshalb nicht als angelegt verbucht."
            )
        return confirmed

    async def update_event(self, uid: str, **changes: Any) -> CalendarEvent:
        existing = await self.get_event(uid)
        if existing is None:
            raise ExternalServiceError(f"Termin '{uid}' nicht gefunden.")
        for key, value in changes.items():
            if value is None:
                continue
            if key in {"title", "titel"}:
                existing.title = value
            elif key in {"start", "beginn"}:
                existing.start = value
            elif key in {"end", "ende"}:
                existing.end = value
            elif key in {"location", "ort"}:
                existing.location = value
            elif key in {"description", "beschreibung"}:
                existing.description = value
            elif key in {"all_day", "ganztaegig"}:
                existing.all_day = bool(value)
        collection = await self.collection_url()
        response = await self._request(
            "PUT", f"{collection.rstrip('/')}/{uid}.ics",
            content=build_vevent(existing).encode("utf-8"),
            headers={"Content-Type": "text/calendar; charset=utf-8"},
        )
        if response.status_code >= 400:
            raise ExternalServiceError(
                f"Die Aenderung wurde abgelehnt (Fehler {response.status_code})."
            )
        confirmed = await self.get_event(uid)
        if confirmed is None:
            raise ExternalServiceError("Der Server hat die Aenderung nicht bestaetigt.")
        return confirmed

    async def delete_event(self, uid: str) -> bool:
        collection = await self.collection_url()
        response = await self._request("DELETE", f"{collection.rstrip('/')}/{uid}.ics")
        if response.status_code >= 400 and response.status_code != 404:
            raise ExternalServiceError(
                f"Der Termin wurde nicht geloescht (Fehler {response.status_code})."
            )
        return await self.get_event(uid) is None

    async def health(self) -> tuple[bool, str]:
        try:
            collection = await self.collection_url()
            now = datetime.now(timezone.utc)
            events = await self.list_events(now - timedelta(days=1), now + timedelta(days=14))
        except (CredentialsMissing, ExternalServiceError) as exc:
            return False, exc.message
        return True, f"CalDAV erreichbar ({collection}), {len(events)} Termine in 14 Tagen"
