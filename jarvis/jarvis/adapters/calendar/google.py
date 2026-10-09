"""Google Calendar samt vollstaendigem OAuth-Ablauf.

Der Ablauf ist so weit vorbereitet, dass nur der eine Schritt bleibt, den
niemand anders tun kann: die Anmeldung im Browser. ``jarvis google-login``
oeffnet die Zustimmungsseite, faengt die Antwort auf ``127.0.0.1`` auf,
tauscht den Code gegen ein Dauer-Token und legt es mit Rechten ``0600``
unter ``data/secrets/google_token.json`` ab.

Der Umfang ist bewusst eng: nur Kalender, nichts weiter.
"""

from __future__ import annotations

import json
import logging
import secrets
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

import httpx

from ...errors import CredentialsMissing, ExternalServiceError
from .base import CalendarAdapter, CalendarEvent

log = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar"]
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API_BASE = "https://www.googleapis.com/calendar/v3"
REDIRECT_PORT = 8766


class GoogleTokenStore:
    """Token auf der Platte, nur fuer den eigenen Nutzer lesbar."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {}
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    def save(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        existing = self.load()
        existing.update({k: v for k, v in data.items() if v is not None})
        self.path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
        try:
            self.path.chmod(0o600)
        except OSError:  # pragma: no cover
            pass

    def clear(self) -> None:
        self.path.unlink(missing_ok=True)


def authorization_url(client_id: str, state: str) -> str:
    query = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": f"http://127.0.0.1:{REDIRECT_PORT}/",
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    })
    return f"{AUTH_URL}?{query}"


def run_oauth_flow(client_id: str, client_secret: str, store: GoogleTokenStore,
                   *, timeout: float = 300.0) -> str:
    """Fuehrt die Anmeldung durch. Gibt eine Meldung fuer die Konsole zurueck.

    Laeuft bewusst synchron: der Schritt passiert einmal von Hand.
    """
    if not (client_id and client_secret):
        raise CredentialsMissing(
            "Fuer Google fehlen GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET.",
            hint="In der Google Cloud Console eine OAuth-Client-ID vom Typ 'Desktop' anlegen.",
        )
    state = secrets.token_urlsafe(16)
    captured: dict[str, str] = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            captured.update({k: v[0] for k, v in query.items()})
            ok = captured.get("state") == state and "code" in captured
            body = (
                "<h2>Fertig.</h2><p>Du kannst das Fenster schliessen.</p>" if ok
                else "<h2>Abgebrochen</h2><p>Bitte den Vorgang erneut starten.</p>"
            )
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(f"<html><body style='font-family:sans-serif'>{body}</body></html>"
                             .encode("utf-8"))

        def log_message(self, *args: Any) -> None:  # Konsole ruhig halten
            return

    url = authorization_url(client_id, state)
    print("\nBitte diese Adresse im Browser oeffnen und die Freigabe erteilen:\n")
    print(url, "\n")
    try:
        import webbrowser
        webbrowser.open(url)
    except Exception:  # pragma: no cover
        pass

    server = HTTPServer(("127.0.0.1", REDIRECT_PORT), Handler)
    server.timeout = timeout
    server.handle_request()
    server.server_close()

    if captured.get("state") != state or "code" not in captured:
        raise CredentialsMissing(
            "Die Anmeldung wurde nicht abgeschlossen.",
            hint=captured.get("error", "Kein Code empfangen."),
        )

    response = httpx.post(TOKEN_URL, data={
        "code": captured["code"], "client_id": client_id, "client_secret": client_secret,
        "redirect_uri": f"http://127.0.0.1:{REDIRECT_PORT}/", "grant_type": "authorization_code",
    }, timeout=30.0)
    if response.status_code >= 400:
        raise CredentialsMissing(f"Google hat den Code abgelehnt: {response.text[:200]}")
    data = response.json()
    store.save({
        "refresh_token": data.get("refresh_token"),
        "access_token": data.get("access_token"),
        "expires_at": (
            datetime.now(timezone.utc) + timedelta(seconds=int(data.get("expires_in", 3600)))
        ).isoformat(),
        "scope": data.get("scope", " ".join(SCOPES)),
    })
    if not data.get("refresh_token"):
        return ("Angemeldet, aber ohne Dauer-Token. Bitte in den Google-Kontoeinstellungen "
                "den Zugriff entfernen und die Anmeldung wiederholen.")
    return "Google-Kalender ist verbunden. Das Token liegt unter data/secrets/google_token.json."


class GoogleCalendar(CalendarAdapter):
    name = "google"

    def __init__(
        self, client_id: str, client_secret: str, store: GoogleTokenStore,
        *, calendar_id: str = "primary", timeout: float = 30.0,
    ) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.store = store
        self.calendar_id = calendar_id or "primary"
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def authorized(self) -> bool:
        return bool(self.store.load().get("refresh_token"))

    async def _access_token(self) -> str:
        data = self.store.load()
        refresh = data.get("refresh_token")
        if not refresh:
            raise CredentialsMissing(
                "Der Google-Kalender ist noch nicht autorisiert.",
                hint="Einmalig 'jarvis google-login' ausfuehren.",
            )
        expires_at = data.get("expires_at")
        if data.get("access_token") and expires_at:
            try:
                if datetime.fromisoformat(expires_at) - timedelta(minutes=2) > datetime.now(timezone.utc):
                    return str(data["access_token"])
            except ValueError:
                pass
        response = await self._http().post(TOKEN_URL, data={
            "refresh_token": refresh, "client_id": self.client_id,
            "client_secret": self.client_secret, "grant_type": "refresh_token",
        })
        if response.status_code >= 400:
            raise CredentialsMissing(
                "Das Google-Token wurde abgelehnt -- die Freigabe ist vermutlich entzogen.",
                hint="'jarvis google-login' erneut ausfuehren.",
            )
        fresh = response.json()
        token = fresh.get("access_token", "")
        self.store.save({
            "access_token": token,
            "expires_at": (
                datetime.now(timezone.utc) + timedelta(seconds=int(fresh.get("expires_in", 3600)))
            ).isoformat(),
        })
        return token

    async def _api(self, method: str, path: str, **kwargs: Any) -> Any:
        token = await self._access_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        try:
            response = await self._http().request(
                method, f"{API_BASE}{path}", headers=headers, **kwargs
            )
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Google Calendar nicht erreichbar: {type(exc).__name__}"
            ) from exc
        if response.status_code == 404:
            return None
        if response.status_code in (401, 403):
            raise CredentialsMissing(
                "Google hat den Zugriff abgelehnt.",
                hint="Umfang pruefen und 'jarvis google-login' wiederholen.",
            )
        if response.status_code >= 400:
            raise ExternalServiceError(
                f"Google Calendar meldet Fehler {response.status_code}: {response.text[:200]}"
            )
        if response.status_code == 204 or not response.content:
            return {}
        return response.json()

    # --- Umwandlung -------------------------------------------------------
    def _to_event(self, raw: dict[str, Any]) -> CalendarEvent:
        start_raw = raw.get("start") or {}
        end_raw = raw.get("end") or {}
        all_day = "date" in start_raw
        start = self._parse(start_raw)
        end = self._parse(end_raw) or (start + timedelta(hours=1))
        return CalendarEvent(
            uid=raw.get("id", ""), title=raw.get("summary", "(ohne Titel)"),
            start=start, end=end, all_day=all_day,
            location=raw.get("location", "") or "",
            description=raw.get("description", "") or "",
            calendar_id=self.calendar_id, provider=self.name,
            etag=raw.get("etag", ""), extra={"htmlLink": raw.get("htmlLink", "")},
        )

    @staticmethod
    def _parse(value: dict[str, Any]) -> datetime:
        if "dateTime" in value:
            return datetime.fromisoformat(value["dateTime"].replace("Z", "+00:00")).astimezone(timezone.utc)
        if "date" in value:
            return datetime.fromisoformat(value["date"]).replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc)

    @staticmethod
    def _to_payload(event: CalendarEvent) -> dict[str, Any]:
        if event.all_day:
            start = {"date": event.start.strftime("%Y-%m-%d")}
            end = {"date": event.end.strftime("%Y-%m-%d")}
        else:
            start = {"dateTime": event.start.astimezone(timezone.utc).isoformat()}
            end = {"dateTime": event.end.astimezone(timezone.utc).isoformat()}
        payload: dict[str, Any] = {"summary": event.title, "start": start, "end": end}
        if event.location:
            payload["location"] = event.location
        if event.description:
            payload["description"] = event.description
        return payload

    # --- Schnittstelle ----------------------------------------------------
    async def list_events(self, start: datetime, end: datetime) -> list[CalendarEvent]:
        data = await self._api(
            "GET", f"/calendars/{urllib.parse.quote(self.calendar_id)}/events",
            params={
                "timeMin": start.astimezone(timezone.utc).isoformat(),
                "timeMax": end.astimezone(timezone.utc).isoformat(),
                "singleEvents": "true", "orderBy": "startTime", "maxResults": 250,
            },
        )
        return [self._to_event(item) for item in (data or {}).get("items", [])]

    async def get_event(self, uid: str) -> CalendarEvent | None:
        data = await self._api(
            "GET", f"/calendars/{urllib.parse.quote(self.calendar_id)}/events/{urllib.parse.quote(uid)}"
        )
        if not data or data.get("status") == "cancelled":
            return None
        return self._to_event(data)

    async def create_event(self, event: CalendarEvent) -> CalendarEvent:
        payload = self._to_payload(event)
        # Idempotenzschluessel: ein wiederholter Versuch legt keinen zweiten Termin an.
        payload["id"] = (event.uid or f"jarvis{uuid.uuid4().hex[:20]}").lower().replace("-", "")[:60]
        created = await self._api(
            "POST", f"/calendars/{urllib.parse.quote(self.calendar_id)}/events", json=payload
        )
        if not created:
            raise ExternalServiceError("Google hat den Termin nicht angelegt.")
        confirmed = await self.get_event(created.get("id", payload["id"]))
        if confirmed is None:
            raise ExternalServiceError(
                "Google hat den Termin nicht bestaetigt -- ich verbuche ihn nicht als angelegt."
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
        await self._api(
            "PATCH",
            f"/calendars/{urllib.parse.quote(self.calendar_id)}/events/{urllib.parse.quote(uid)}",
            json=self._to_payload(existing),
        )
        confirmed = await self.get_event(uid)
        if confirmed is None:
            raise ExternalServiceError("Google hat die Aenderung nicht bestaetigt.")
        return confirmed

    async def delete_event(self, uid: str) -> bool:
        await self._api(
            "DELETE",
            f"/calendars/{urllib.parse.quote(self.calendar_id)}/events/{urllib.parse.quote(uid)}",
        )
        return await self.get_event(uid) is None

    async def health(self) -> tuple[bool, str]:
        if not self.authorized:
            return False, "Google-Kalender noch nicht autorisiert ('jarvis google-login')"
        try:
            data = await self._api("GET", f"/calendars/{urllib.parse.quote(self.calendar_id)}")
        except (CredentialsMissing, ExternalServiceError) as exc:
            return False, exc.message
        if not data:
            return False, f"Kalender '{self.calendar_id}' nicht gefunden"
        return True, f"Google-Kalender '{data.get('summary', self.calendar_id)}' erreichbar"
