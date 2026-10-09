"""Telefonie ueber Twilio Voice.

Zwei Betriebsarten:

1. **Erinnerungsanruf** -- Jarvis ruft an, liest den Text vor und bittet um
   eine Bestaetigung per Tastendruck (1 = erledigt, 2 = in 15 Minuten
   nochmal). Das Ergebnis landet in ``call_log`` und bestaetigt bzw.
   verschiebt die Erinnerung.
2. **Gespraech** -- Jarvis nimmt gesprochene Antworten auf, schickt sie
   durch dasselbe KI-System wie Telegram und liest die Antwort vor.
   Dafuer braucht Twilio eine oeffentlich erreichbare Rueckadresse
   (``PUBLIC_BASE_URL``), die auf den HTTP-Dienst zeigt.

Schutzmassnahmen: Tageslimit, Begrenzung der Versuche, Idempotenzschluessel
je Erinnerung und Versuch, und ein harter Schalter (``PHONE_ENABLED``),
mit dem Telefonie vollstaendig aus ist.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from xml.sax.saxutils import escape as xml_escape

import httpx

from ...db.database import Database, iso, utcnow
from ...errors import ConfigError, CredentialsMissing, ExternalServiceError

log = logging.getLogger(__name__)

API_BASE = "https://api.twilio.com/2010-04-01"
PHONE_PATTERN = re.compile(r"^\+[1-9]\d{6,15}$")


def normalize_number(raw: str) -> str:
    """Auf E.164 bringen -- Twilio nimmt nichts anderes."""
    cleaned = re.sub(r"[^\d+]", "", (raw or "").strip())
    if cleaned.startswith("00"):
        cleaned = "+" + cleaned[2:]
    elif cleaned.startswith("0"):
        cleaned = "+49" + cleaned[1:]      # deutsche Nummer ohne Landesvorwahl
    if not cleaned.startswith("+") and cleaned:
        cleaned = "+" + cleaned
    if not PHONE_PATTERN.match(cleaned):
        raise ConfigError(
            f"'{raw}' ist keine brauchbare Rufnummer.",
            hint="Internationales Format erwartet, z. B. +4915112345678.",
        )
    return cleaned


def say(text: str, *, voice: str, language: str) -> str:
    return f'<Say voice="{voice}" language="{language}">{xml_escape(text)}</Say>'


def reminder_twiml(
    text: str, *, voice: str, language: str, action_url: str = "", repeat: bool = True
) -> str:
    """Ansage mit Tastenbestaetigung. Ohne Rueckadresse nur die Ansage."""
    spoken = f"Hallo, hier ist Jarvis. {text}"
    body = [say(spoken, voice=voice, language=language)]
    if action_url:
        gather = (
            f'<Gather numDigits="1" timeout="8" action="{xml_escape(action_url)}" method="POST">'
            + say(
                "Druecke die Eins, wenn das erledigt ist. Druecke die Zwei, "
                "damit ich in fuenfzehn Minuten noch einmal erinnere.",
                voice=voice, language=language,
            )
            + "</Gather>"
        )
        body.append(gather)
        body.append(say("Ich habe nichts gehoert. Bis spaeter.", voice=voice, language=language))
    elif repeat:
        body.append('<Pause length="1"/>')
        body.append(say(spoken, voice=voice, language=language))
    return '<?xml version="1.0" encoding="UTF-8"?><Response>' + "".join(body) + "</Response>"


def conversation_twiml(
    prompt: str, *, voice: str, language: str, action_url: str, hangup: bool = False,
    timeout: int = 5,
) -> str:
    """Eine Gespraechsrunde: vorlesen, zuhoeren, Ergebnis an ``action_url``."""
    body = [say(prompt, voice=voice, language=language)]
    if hangup:
        body.append("<Hangup/>")
    else:
        body.append(
            f'<Gather input="speech" language="{language}" speechTimeout="auto" '
            f'timeout="{timeout}" action="{xml_escape(action_url)}" method="POST"/>'
        )
        body.append(say("Ich habe nichts gehoert. Bis dann.", voice=voice, language=language))
        body.append("<Hangup/>")
    return '<?xml version="1.0" encoding="UTF-8"?><Response>' + "".join(body) + "</Response>"


@dataclass(slots=True)
class CallResult:
    sid: str
    status: str
    to_number: str
    log_id: int


class TwilioPhone:
    def __init__(
        self, account_sid: str, auth_token: str, from_number: str, database: Database,
        *, my_number: str = "", voice: str = "Google.de-DE-Standard-B",
        language: str = "de-DE", public_base_url: str = "", daily_limit: int = 20,
        timeout: float = 30.0,
    ) -> None:
        if not (account_sid and auth_token and from_number):
            raise CredentialsMissing(
                "Telefonie ist nicht vollstaendig konfiguriert.",
                hint="TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN und TWILIO_FROM_NUMBER setzen.",
            )
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_number = normalize_number(from_number)
        self.my_number = normalize_number(my_number) if my_number else ""
        self.db = database
        self.voice = voice
        self.language = language
        self.public_base_url = (public_base_url or "").rstrip("/")
        self.daily_limit = daily_limit
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self.timeout, auth=(self.account_sid, self.auth_token)
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # --- Schutz -----------------------------------------------------------
    def calls_today(self) -> int:
        return int(self.db.scalar(
            "SELECT COUNT(*) FROM call_log WHERE created_at >= ? AND status NOT IN ('abgelehnt',)",
            (iso(utcnow() - timedelta(days=1)),),
        ) or 0)

    def recent_duplicate(self, purpose: str, to_number: str, minutes: int = 5) -> bool:
        """Verhindert, dass derselbe Anruf zweimal rausgeht."""
        return bool(self.db.query_one(
            "SELECT id FROM call_log WHERE purpose = ? AND to_number = ? AND created_at >= ? "
            "AND status NOT IN ('fehler','abgelehnt') LIMIT 1",
            (purpose, to_number, iso(utcnow() - timedelta(minutes=minutes))),
        ))

    # --- Anrufen ----------------------------------------------------------
    async def place_call(
        self, *, to_number: str = "", twiml: str = "", url: str = "", purpose: str = "erinnerung",
        reminder_id: int | None = None, status_callback: str = "",
    ) -> CallResult:
        target = normalize_number(to_number or self.my_number)
        if not (twiml or url):
            raise ConfigError("Fuer einen Anruf braucht es entweder TwiML oder eine URL.")
        if self.calls_today() >= self.daily_limit:
            raise ExternalServiceError(
                f"Das Tageslimit von {self.daily_limit} Anrufen ist erreicht. "
                "Ich rufe heute nicht mehr an."
            )
        if self.recent_duplicate(purpose, target):
            raise ExternalServiceError(
                "Derselbe Anruf ist gerade erst rausgegangen -- ich wiederhole ihn nicht."
            )

        log_id = self.db.insert("call_log", {
            "provider_sid": "", "direction": "ausgehend", "to_number": target,
            "purpose": purpose, "status": "geplant", "reminder_id": reminder_id,
            "created_at": iso(utcnow()), "updated_at": iso(utcnow()),
        })

        data: dict[str, str] = {"To": target, "From": self.from_number}
        if url:
            data["Url"] = url
        else:
            data["Twiml"] = twiml
        if status_callback:
            data["StatusCallback"] = status_callback
            data["StatusCallbackEvent"] = "completed"
        try:
            response = await self._http().post(
                f"{API_BASE}/Accounts/{self.account_sid}/Calls.json", data=data
            )
        except httpx.HTTPError as exc:
            self._update(log_id, status="fehler", error=f"{type(exc).__name__}: {exc}")
            raise ExternalServiceError(f"Twilio nicht erreichbar: {type(exc).__name__}") from exc

        if response.status_code in (401, 403):
            self._update(log_id, status="fehler", error="Zugangsdaten abgelehnt")
            raise CredentialsMissing("Twilio hat die Zugangsdaten abgelehnt.")
        if response.status_code >= 400:
            detail = response.text[:300]
            self._update(log_id, status="fehler", error=detail)
            raise ExternalServiceError(f"Twilio lehnt den Anruf ab ({response.status_code}): {detail}")

        payload = response.json()
        sid = payload.get("sid", "")
        self._update(log_id, status=payload.get("status", "gestartet"), provider_sid=sid)
        log.info("Anruf an %s gestartet (%s, Zweck %s)", target, sid, purpose)
        return CallResult(sid=sid, status=payload.get("status", ""), to_number=target, log_id=log_id)

    async def call_reminder(
        self, text: str, *, reminder_id: int | None = None, to_number: str = "",
    ) -> CallResult:
        action_url = (
            f"{self.public_base_url}/telefon/erinnerung-antwort?erinnerung={reminder_id or 0}"
            if self.public_base_url else ""
        )
        twiml = reminder_twiml(
            text, voice=self.voice, language=self.language, action_url=action_url
        )
        return await self.place_call(
            to_number=to_number, twiml=twiml, purpose=f"erinnerung:{reminder_id or 0}",
            reminder_id=reminder_id,
            status_callback=(
                f"{self.public_base_url}/telefon/status" if self.public_base_url else ""
            ),
        )

    async def call_conversation(self, opening: str = "", *, to_number: str = "") -> CallResult:
        """Ruft an und uebergibt das Gespraech an den HTTP-Dienst."""
        if not self.public_base_url:
            raise ConfigError(
                "Fuer ein Gespraech braucht Twilio eine oeffentliche Rueckadresse.",
                hint="PUBLIC_BASE_URL setzen (HTTPS-Tunnel auf den Jarvis-HTTP-Port).",
            )
        query = f"?start={httpx.QueryParams({'text': opening})['text']}" if opening else ""
        return await self.place_call(
            to_number=to_number,
            url=f"{self.public_base_url}/telefon/gespraech{query}",
            purpose="gespraech",
            status_callback=f"{self.public_base_url}/telefon/status",
        )

    async def hangup(self, sid: str) -> bool:
        try:
            response = await self._http().post(
                f"{API_BASE}/Accounts/{self.account_sid}/Calls/{sid}.json",
                data={"Status": "completed"},
            )
        except httpx.HTTPError:
            return False
        return response.status_code < 400

    async def call_status(self, sid: str) -> str:
        try:
            response = await self._http().get(
                f"{API_BASE}/Accounts/{self.account_sid}/Calls/{sid}.json"
            )
        except httpx.HTTPError:
            return "unbekannt"
        if response.status_code >= 400:
            return "unbekannt"
        return response.json().get("status", "unbekannt")

    # --- Protokoll --------------------------------------------------------
    def _update(self, log_id: int, **values: Any) -> None:
        values["updated_at"] = iso(utcnow())
        self.db.update("call_log", log_id, values)

    def note_result(self, sid: str, status: str, *, transcript: str = "") -> None:
        row = self.db.query_one("SELECT id FROM call_log WHERE provider_sid = ?", (sid,))
        if row is None:
            return
        values: dict[str, Any] = {"status": status, "updated_at": iso(utcnow())}
        if transcript:
            values["transcript"] = transcript[:4000]
        self.db.update("call_log", row["id"], values)

    def recent_calls(self, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.db.query(
            "SELECT id, provider_sid, to_number, purpose, status, created_at, error "
            "FROM call_log ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        return [dict(r) for r in rows]

    async def health(self) -> tuple[bool, str]:
        try:
            response = await self._http().get(f"{API_BASE}/Accounts/{self.account_sid}.json")
        except httpx.HTTPError as exc:
            return False, f"Twilio nicht erreichbar: {type(exc).__name__}"
        if response.status_code in (401, 403):
            return False, "Twilio-Zugangsdaten abgelehnt"
        if response.status_code >= 400:
            return False, f"Twilio meldet Fehler {response.status_code}"
        account = response.json()
        note = f"Twilio-Konto '{account.get('friendly_name', '')}' ({account.get('status', '')})"
        if not self.public_base_url:
            note += " -- ohne PUBLIC_BASE_URL nur Ansagen, keine Gespraeche"
        return True, note
