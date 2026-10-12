"""Werkzeuge, die etwas auf dem Rechner tun.

Drei Dinge: ein Programm starten, eine Seite oeffnen, auf den Bildschirm
sehen. Alle drei sind bewusst eng gefasst:

* Programme nur aus der Liste in ``ORB_PROGRAMME``. Ein frei waehlbarer
  Programmname waere eine Hintertuer -- ein Satz in einer fremden E-Mail
  koennte sonst eine Anwendung starten.
* Seiten nur ueber http/https.
* Das Bildschirmfoto wird beschrieben und sofort verworfen.

Abschalten laesst sich alles zusammen mit ``ORB_AKTIONEN=false``.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import sys
from typing import TYPE_CHECKING
from urllib.parse import urlparse

import httpx

from .toolkit import ToolResult, schema, text_field

if TYPE_CHECKING:
    from .services import Services

log = logging.getLogger(__name__)


def _passt(name: str, erlaubte: list[str]) -> str | None:
    """Findet den gemeinten Eintrag aus der erlaubten Liste."""
    gesucht = (name or "").strip().lower()
    if not gesucht:
        return None
    for eintrag in erlaubte:
        if eintrag.lower() == gesucht:
            return eintrag
    for eintrag in erlaubte:
        if gesucht in eintrag.lower() or eintrag.lower() in gesucht:
            return eintrag
    return None


async def oeffne(ziel: str, *, als_app: bool = False) -> tuple[bool, str]:
    """``open`` auf macOS, ``xdg-open`` sonst."""
    if sys.platform == "darwin":
        befehl = ["open", "-a", ziel] if als_app else ["open", ziel]
    elif shutil.which("xdg-open") and not als_app:
        befehl = ["xdg-open", ziel]
    else:
        return False, "Das kann ich auf diesem Betriebssystem nicht starten."
    try:
        prozess = await asyncio.create_subprocess_exec(
            *befehl, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE
        )
        _, fehler = await asyncio.wait_for(prozess.communicate(), timeout=20)
    except (OSError, asyncio.TimeoutError, TimeoutError) as exc:
        return False, f"Start fehlgeschlagen: {exc}"
    if prozess.returncode != 0:
        return False, (fehler or b"").decode("utf-8", "replace").strip()[:200] or "Start fehlgeschlagen."
    return True, ""


async def wetter(stadt: str) -> str:
    """Kurze Wetterzeile. Open-Meteo, ohne Schluessel, ohne Anmeldung."""
    stadt = (stadt or "").strip()
    if not stadt:
        return ""
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            ort = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": stadt, "count": 1, "language": "de", "format": "json"},
            )
            treffer = (ort.json().get("results") or [None])[0]
            if not treffer:
                return ""
            wetterdaten = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": treffer["latitude"], "longitude": treffer["longitude"],
                    "current": "temperature_2m,apparent_temperature,weather_code",
                    "timezone": "auto",
                },
            )
            jetzt = wetterdaten.json().get("current", {})
    except (httpx.HTTPError, ValueError, KeyError) as fehler:
        log.debug("Wetter nicht abrufbar: %s", fehler)
        return ""
    grad = jetzt.get("temperature_2m")
    gefuehlt = jetzt.get("apparent_temperature")
    if grad is None:
        return ""
    beschreibung = WETTERLAGE.get(int(jetzt.get("weather_code") or 0), "")
    teile = [f"{round(grad)} Grad"]
    if gefuehlt is not None and abs(gefuehlt - grad) >= 2:
        teile.append(f"gefuehlt {round(gefuehlt)}")
    if beschreibung:
        teile.append(beschreibung)
    return f"{treffer.get('name', stadt)}: " + ", ".join(teile)


#: WMO-Schluessel, zusammengefasst auf das, was man sagen wuerde.
WETTERLAGE = {
    0: "klar", 1: "ueberwiegend klar", 2: "wechselnd bewoelkt", 3: "bedeckt",
    45: "Nebel", 48: "Nebel", 51: "Nieselregen", 53: "Nieselregen", 55: "Nieselregen",
    61: "Regen", 63: "Regen", 65: "starker Regen", 66: "gefrierender Regen",
    67: "gefrierender Regen", 71: "Schnee", 73: "Schnee", 75: "starker Schnee",
    77: "Schneegriesel", 80: "Schauer", 81: "Schauer", 82: "kraeftige Schauer",
    85: "Schneeschauer", 86: "Schneeschauer", 95: "Gewitter", 96: "Gewitter",
    99: "schweres Gewitter",
}


def register(services: "Services") -> None:
    einstellungen = services.settings

    def aktionen_an() -> bool:
        return bool(einstellungen.orb_aktionen)

    async def programm_starten(programm: str) -> ToolResult:
        """Startet ein Programm aus der erlaubten Liste."""
        if not aktionen_an():
            return ToolResult.failure("Aktionen auf dem Rechner sind aus (ORB_AKTIONEN=false).")
        erlaubt = einstellungen.orb_programme
        if not erlaubt:
            return ToolResult.failure(
                "Es ist kein Programm freigegeben. Trag sie in ORB_PROGRAMME ein, "
                "zum Beispiel: ORB_PROGRAMME=Spotify,Visual Studio Code,Obsidian"
            )
        treffer = _passt(programm, erlaubt)
        if treffer is None:
            return ToolResult.failure(
                f"'{programm}' steht nicht auf der Liste. Freigegeben: {', '.join(erlaubt)}."
            )
        ok, fehler = await oeffne(treffer, als_app=True)
        if not ok:
            return ToolResult.failure(f"{treffer} liess sich nicht starten. {fehler}")
        services.memory.remember_event("programm_gestartet", treffer)
        return ToolResult.success(f"{treffer} laeuft.", programm=treffer)

    services.toolkit.register(
        "programm_starten",
        "Startet ein freigegebenes Programm auf dem Rechner (z. B. Spotify, VS Code).",
        schema(programm=text_field("Name des Programms", pflicht=True)),
        programm_starten, category="rechner", verfuegbar=aktionen_an,
    )

    async def webseite_oeffnen(adresse: str) -> ToolResult:
        """Oeffnet eine Seite im Standardbrowser."""
        if not aktionen_an():
            return ToolResult.failure("Aktionen auf dem Rechner sind aus (ORB_AKTIONEN=false).")
        adresse = (adresse or "").strip()
        if adresse and "://" not in adresse:
            adresse = "https://" + adresse
        zerlegt = urlparse(adresse)
        if zerlegt.scheme not in {"http", "https"} or not zerlegt.netloc:
            return ToolResult.failure(f"'{adresse}' ist keine Webadresse, die ich oeffne.")
        ok, fehler = await oeffne(adresse)
        if not ok:
            return ToolResult.failure(f"Die Seite liess sich nicht oeffnen. {fehler}")
        return ToolResult.success(f"{zerlegt.netloc} ist auf.", adresse=adresse)

    services.toolkit.register(
        "webseite_oeffnen",
        "Oeffnet eine Webseite im Browser ('mach mal Tagesschau auf').",
        schema(adresse=text_field("Adresse der Seite", pflicht=True)),
        webseite_oeffnen, category="rechner", verfuegbar=aktionen_an,
    )

    async def bildschirm_ansehen(frage: str = "") -> ToolResult:
        """Macht ein Bild vom Bildschirm und beschreibt es."""
        if not aktionen_an():
            return ToolResult.failure("Aktionen auf dem Rechner sind aus (ORB_AKTIONEN=false).")
        from ..adapters import vision
        from ..errors import JarvisError

        moeglich, hinweis = vision.aufnahme_moeglich()
        if not moeglich:
            return ToolResult.failure(hinweis)
        bild = await vision.bildschirmfoto()
        if not bild:
            return ToolResult.failure(
                "Ich bekomme kein Bild. Systemeinstellungen → Datenschutz & Sicherheit → "
                "Bildschirmaufnahme → Terminal erlauben, danach Terminal neu starten."
            )
        try:
            beschreibung = await vision.beschreibe_bild(
                bild, frage, api_key=einstellungen.anthropic_api_key,
                modell=einstellungen.vision_modell,
            )
        except JarvisError as exc:
            return ToolResult.failure(exc.message)
        # Das Bild bleibt nirgends liegen -- nur der Text geht weiter.
        return ToolResult.success(beschreibung)

    services.toolkit.register(
        "bildschirm_ansehen",
        "Sieht sich den Bildschirm an und beschreibt, was darauf zu sehen ist.",
        schema(frage=text_field("Worauf soll ich besonders achten?")),
        bildschirm_ansehen, category="rechner", timeout=120.0,
        verfuegbar=lambda: aktionen_an() and bool(einstellungen.anthropic_api_key),
    )

    async def wetter_jetzt(stadt: str = "") -> ToolResult:
        """Kurzes Wetter -- ohne Schluessel, ohne Anmeldung."""
        ort = stadt.strip() or einstellungen.orb_stadt
        if not ort:
            return ToolResult.failure("Welche Stadt?")
        zeile = await wetter(ort)
        if not zeile:
            return ToolResult.failure(f"Zu '{ort}' bekomme ich gerade kein Wetter.")
        return ToolResult.success(zeile, stadt=ort)

    services.toolkit.register(
        "wetter",
        "Sagt das aktuelle Wetter (Standardstadt aus den Einstellungen).",
        schema(stadt=text_field("Stadt, leer = Standardstadt")),
        wetter_jetzt, category="rechner",
    )
