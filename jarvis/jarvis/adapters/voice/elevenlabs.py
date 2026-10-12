"""Stimme ueber ElevenLabs.

Zwei Dinge entscheiden, ob es menschlich klingt:

* **Die Einstellungen.** Hohe Stabilitaet macht eine Stimme gleichfoermig --
  das ist der Klang, den man als "Computerstimme" erkennt. Etwas weniger
  Stabilitaet plus etwas Stil laesst Betonung und Tempo schwanken, so wie
  beim Sprechen. Die Werte lassen sich im Dashboard verschieben.
* **Der Text.** "13:13 Uhr" liest jede Stimme als Ziffernfolge vor. Was
  ausgeschrieben ankommt, wird auch gesprochen wie gesprochen -- darum
  kuemmert sich ``core.sprechtext``.

Jede Datei wird zwischengespeichert: derselbe Satz kostet nur einmal.
Faellt der Dienst aus, kommt ``None`` zurueck und die Oberflaeche spricht
mit der Stimme des Systems weiter, statt stumm zu bleiben.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path

import httpx

from ...errors import ExternalServiceError

log = logging.getLogger(__name__)

#: Laengere Texte kosten und dauern; fuer einen gesprochenen Absatz reicht das.
MAX_ZEICHEN = 1200

#: Standardwerte. Weniger Stabilitaet = mehr Ausdruck, aber unruhiger.
STANDARD = {"stability": 0.38, "similarity_boost": 0.8, "style": 0.3, "speaker_boost": True}


@dataclass(slots=True)
class Stimmeinstellung:
    stabilitaet: float = STANDARD["stability"]
    aehnlichkeit: float = STANDARD["similarity_boost"]
    stil: float = STANDARD["style"]
    verstaerkung: bool = STANDARD["speaker_boost"]
    tempo: float = 1.0

    def als_api(self) -> dict[str, object]:
        werte: dict[str, object] = {
            "stability": _grenze(self.stabilitaet),
            "similarity_boost": _grenze(self.aehnlichkeit),
            "style": _grenze(self.stil),
            "use_speaker_boost": bool(self.verstaerkung),
        }
        if abs(self.tempo - 1.0) > 0.01:
            werte["speed"] = max(0.7, min(1.2, self.tempo))
        return werte

    def kennung(self) -> str:
        return (f"{self.stabilitaet:.2f}-{self.aehnlichkeit:.2f}-{self.stil:.2f}"
                f"-{int(self.verstaerkung)}-{self.tempo:.2f}")


def _grenze(wert: float) -> float:
    try:
        return max(0.0, min(1.0, float(wert)))
    except (TypeError, ValueError):
        return 0.5


class ElevenLabsStimme:
    def __init__(
        self, api_key: str, voice_id: str, *, modell: str = "eleven_multilingual_v2",
        api_base: str = "https://api.elevenlabs.io/v1", audio_dir: Path | None = None,
        einstellung: Stimmeinstellung | None = None,
    ) -> None:
        self.api_key = api_key
        self.voice_id = voice_id
        self.modell = modell
        self.api_base = api_base.rstrip("/")
        self.audio_dir = audio_dir
        self.einstellung = einstellung or Stimmeinstellung()
        if self.audio_dir:
            self.audio_dir.mkdir(parents=True, exist_ok=True)

    @property
    def verfuegbar(self) -> bool:
        return bool(self.api_key and self.voice_id and self.audio_dir)

    def beschreibe(self) -> str:
        if not self.api_key:
            return "ElevenLabs: kein Schluessel (ELEVENLABS_API_KEY) -- Systemstimme wird benutzt"
        if not self.voice_id:
            return "ElevenLabs: keine Stimme gewaehlt -- im Dashboard eine aussuchen"
        return f"ElevenLabs, Stimme {self.voice_id}, Modell {self.modell}"

    # ------------------------------------------------------------------
    async def datei(self, text: str, *, voice_id: str = "") -> Path | None:
        """Erzeugt eine MP3. ``None``, wenn es nicht geklappt hat."""
        text = " ".join((text or "").split())[:MAX_ZEICHEN]
        stimme = voice_id or self.voice_id
        if not text or not self.audio_dir or not (self.api_key and stimme):
            return None
        name = hashlib.sha256(
            f"{stimme}:{self.modell}:{self.einstellung.kennung()}:{text}".encode()
        ).hexdigest()[:24]
        ziel = self.audio_dir / f"{name}.mp3"
        if ziel.exists() and ziel.stat().st_size > 0:
            return ziel
        try:
            inhalt = await self._holen(text, stimme)
        except ExternalServiceError as fehler:
            log.error("%s", fehler.message)
            return None
        if not inhalt:
            return None
        ziel.write_bytes(inhalt)
        return ziel

    async def _holen(self, text: str, stimme: str) -> bytes:
        """Holt die Tonspur. ``stream`` liefert frueher die ersten Bytes."""
        nutzlast = {
            "text": text,
            "model_id": self.modell,
            "voice_settings": self.einstellung.als_api(),
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                antwort = await client.post(
                    f"{self.api_base}/text-to-speech/{stimme}/stream",
                    headers={"xi-api-key": self.api_key, "accept": "audio/mpeg"},
                    params={"optimize_streaming_latency": "2", "output_format": "mp3_44100_128"},
                    json=nutzlast,
                )
        except httpx.HTTPError as fehler:
            raise ExternalServiceError(f"ElevenLabs nicht erreichbar: {fehler}") from fehler
        if antwort.status_code == 401:
            raise ExternalServiceError(
                "ElevenLabs lehnt den Schluessel ab -- ELEVENLABS_API_KEY pruefen."
            )
        if antwort.status_code in {400, 404} and stimme in antwort.text:
            raise ExternalServiceError(
                f"ElevenLabs kennt die Stimme '{stimme}' in deinem Konto nicht. "
                "Aus der Stimmenbibliothek muss sie einmal mit 'Add to my voices' "
                "uebernommen werden."
            )
        if antwort.status_code == 422:
            raise ExternalServiceError(
                f"ElevenLabs mag die Anfrage nicht: {antwort.text[:200]}"
            )
        if antwort.status_code >= 400:
            raise ExternalServiceError(
                f"ElevenLabs antwortet {antwort.status_code}: {antwort.text[:200]}"
            )
        return antwort.content

    # ------------------------------------------------------------------
    async def stimmen(self) -> list[dict[str, str]]:
        """Alle verfuegbaren Stimmen -- fuer die Auswahl im Dashboard."""
        if not self.api_key:
            raise ExternalServiceError(
                "Ohne ELEVENLABS_API_KEY gibt es keine Stimmenliste."
            )
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                antwort = await client.get(
                    f"{self.api_base}/voices", headers={"xi-api-key": self.api_key}
                )
        except httpx.HTTPError as fehler:
            raise ExternalServiceError(f"ElevenLabs nicht erreichbar: {fehler}") from fehler
        if antwort.status_code >= 400:
            raise ExternalServiceError(f"Stimmenliste abgelehnt ({antwort.status_code})")
        gefunden = []
        for stimme in antwort.json().get("voices", []):
            marken = stimme.get("labels") or {}
            beschreibung = ", ".join(
                str(marken[feld]) for feld in ("gender", "age", "accent", "description")
                if marken.get(feld)
            )
            gefunden.append({
                "id": stimme.get("voice_id", ""),
                "name": stimme.get("name", ""),
                "beschreibung": beschreibung,
                "probe": stimme.get("preview_url", "") or "",
            })
        return [s for s in gefunden if s["id"]]

    async def health(self) -> tuple[bool, str]:
        if not self.api_key:
            return True, (
                "Browserstimme (kein ELEVENLABS_API_KEY -- funktioniert, "
                "klingt nur nicht nach Jarvis)"
            )
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
        benutzt, grenze = daten.get("character_count"), daten.get("character_limit")
        rest = ""
        if isinstance(benutzt, int) and isinstance(grenze, int):
            rest = f", {grenze - benutzt:,} Zeichen frei".replace(",", ".")
        if not self.voice_id:
            return False, f"ElevenLabs bereit, aber keine Stimme gewaehlt{rest}"
        return True, f"ElevenLabs bereit (Stimme {self.voice_id}, {self.modell}){rest}"
