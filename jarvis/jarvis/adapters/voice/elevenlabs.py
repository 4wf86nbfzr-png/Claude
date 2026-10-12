"""Stimme ueber ElevenLabs.

Eine Datei pro Satz, im Datenverzeichnis zwischengespeichert: derselbe
Satz wird nicht zweimal bezahlt. Faellt der Dienst aus, gibt es ``None``
zurueck -- die Oberflaeche spricht dann mit der Stimme des Betriebssystems
weiter, statt stumm zu bleiben.
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

#: Laengere Texte kosten und dauern; fuer eine gesprochene Antwort reicht das.
MAX_ZEICHEN = 1200


class ElevenLabsStimme:
    def __init__(
        self, api_key: str, voice_id: str, *, modell: str = "eleven_multilingual_v2",
        api_base: str = "https://api.elevenlabs.io/v1", audio_dir: Path | None = None,
    ) -> None:
        self.api_key = api_key
        self.voice_id = voice_id
        self.modell = modell
        self.api_base = api_base.rstrip("/")
        self.audio_dir = audio_dir
        if self.audio_dir:
            self.audio_dir.mkdir(parents=True, exist_ok=True)

    @property
    def verfuegbar(self) -> bool:
        return bool(self.api_key and self.voice_id and self.audio_dir)

    def beschreibe(self) -> str:
        if not self.api_key:
            return "ElevenLabs: kein Schluessel (ELEVENLABS_API_KEY) -- Systemstimme wird benutzt"
        if not self.voice_id:
            return "ElevenLabs: keine Stimme gewaehlt (ELEVENLABS_VOICE_ID)"
        return f"ElevenLabs, Stimme {self.voice_id}, Modell {self.modell}"

    async def datei(self, text: str) -> Path | None:
        """Erzeugt eine MP3. ``None``, wenn es nicht geklappt hat."""
        text = " ".join((text or "").split())[:MAX_ZEICHEN]
        if not text or not self.verfuegbar:
            return None
        name = hashlib.sha256(
            f"{self.voice_id}:{self.modell}:{text}".encode()
        ).hexdigest()[:24]
        ziel = self.audio_dir / f"{name}.mp3"
        if ziel.exists():
            return ziel

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                antwort = await client.post(
                    f"{self.api_base}/text-to-speech/{self.voice_id}",
                    headers={"xi-api-key": self.api_key, "accept": "audio/mpeg"},
                    json={
                        "text": text, "model_id": self.modell,
                        "voice_settings": {"stability": 0.4, "similarity_boost": 0.8},
                    },
                )
                if antwort.status_code >= 400:
                    log.error("ElevenLabs antwortet %s: %s", antwort.status_code,
                              antwort.text[:200])
                    return None
                inhalt = antwort.content
        except httpx.HTTPError as fehler:
            log.error("ElevenLabs nicht erreichbar: %s", fehler)
            return None

        if not inhalt:
            return None
        ziel.write_bytes(inhalt)
        return ziel

    async def health(self) -> tuple[bool, str]:
        if not self.verfuegbar:
            return False, self.beschreibe()
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                antwort = await client.get(
                    f"{self.api_base}/user/subscription",
                    headers={"xi-api-key": self.api_key},
                )
        except httpx.HTTPError as fehler:
            return False, f"ElevenLabs nicht erreichbar: {fehler}"
        if antwort.status_code == 401:
            return False, "ElevenLabs lehnt den Schluessel ab (ELEVENLABS_API_KEY pruefen)"
        if antwort.status_code >= 400:
            return False, f"ElevenLabs antwortet {antwort.status_code}"
        daten = antwort.json()
        benutzt = daten.get("character_count")
        grenze = daten.get("character_limit")
        rest = f", {grenze - benutzt} Zeichen frei" if isinstance(benutzt, int) and isinstance(grenze, int) else ""
        return True, f"ElevenLabs bereit (Stimme {self.voice_id}){rest}"
