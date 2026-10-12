"""Der Orb: Jarvis zum Sprechen.

Die Oberflaeche im Browser hoert zu (Web Speech API), schickt den Text
hierher und spielt ab, was zurueckkommt. Hier passiert dazwischen alles:

1. Weckwort erkannt -> Begruessung mit Uhrzeit, Wetter und Aufgaben.
2. Sonst geht der Satz an denselben Gespraechsfuehrer wie in Telegram --
   gleiches Gedaechtnis, gleiche Aufgaben, gleiche Werkzeuge.
3. Die Antwort wird fuer die Stimme aufbereitet (keine Sternchen, keine
   Listenpunkte) und bei ElevenLabs gesprochen. Ohne Schluessel spricht
   der Browser selbst -- die Oberflaeche bleibt dadurch benutzbar.

Zusaetzlich versteht der Orb Aktionsmarken am Ende einer Antwort
(``[AKTION:OEFFNE] tagesschau.de``). Modelle mit Werkzeugaufrufen brauchen
das nicht; kleine Modelle schreiben so etwas aber gern als Text, und dann
soll es trotzdem passieren statt vorgelesen zu werden.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any

from .timeutil import to_local

if TYPE_CHECKING:
    from .services import Services

log = logging.getLogger(__name__)

#: "[AKTION:OEFFNE] tagesschau.de" -- Marke, Rest der Zeile ist das Argument.
AKTIONSMARKE = re.compile(
    r"\[\s*(?:AKTION|ACTION)\s*:\s*(\w+)\s*\]\s*([^\n\[]*)", re.IGNORECASE
)

#: Marke -> Werkzeug und Feldname fuer das Argument.
AKTIONEN: dict[str, tuple[str, str]] = {
    "suche": ("web_suchen", "frage"),
    "search": ("web_suchen", "frage"),
    "oeffne": ("webseite_oeffnen", "adresse"),
    "open": ("webseite_oeffnen", "adresse"),
    "start": ("programm_starten", "programm"),
    "bildschirm": ("bildschirm_ansehen", "frage"),
    "screen": ("bildschirm_ansehen", "frage"),
    "nachrichten": ("nachrichten_liste", ""),
    "news": ("nachrichten_liste", ""),
    "wetter": ("wetter", "stadt"),
    "bericht": ("hintergrundbericht", ""),
}


@dataclass(slots=True)
class OrbAntwort:
    """Was die Oberflaeche anzeigt und abspielt."""

    text: str
    #: Fuer die Stimme aufbereitet (ohne Formatierung).
    gesprochen: str = ""
    #: Adresse der Audiodatei, leer = der Browser spricht selbst.
    audio: str = ""
    aktionen: list[str] = field(default_factory=list)
    werkzeuge: list[str] = field(default_factory=list)

    def als_json(self) -> dict[str, Any]:
        return {
            "text": self.text, "gesprochen": self.gesprochen or fuer_stimme(self.text),
            "audio": self.audio, "aktionen": self.aktionen, "werkzeuge": self.werkzeuge,
        }


def fuer_stimme(text: str) -> str:
    """Nimmt alles heraus, was vorgelesen albern klingt."""
    ohne = AKTIONSMARKE.sub(" ", text or "")
    # Erst die Nummern ausschreiben, dann die Formatierung wegnehmen --
    # sonst ist die Raute weg, bevor "Nummer 12" daraus werden kann.
    ohne = re.sub(r"#(\d+)", r"Nummer \1", ohne)
    ohne = re.sub(r"[*_`#]+", "", ohne)
    ohne = re.sub(r"^\s*[-•]\s*", " ", ohne, flags=re.MULTILINE)
    ohne = re.sub(r"\bhttps?://\S+", "die verlinkte Seite", ohne)
    return " ".join(ohne.split())


def tageszeit(jetzt: datetime) -> str:
    stunde = jetzt.hour
    if stunde < 5:
        return "Noch wach"
    if stunde < 11:
        return "Guten Morgen"
    if stunde < 18:
        return "Guten Tag"
    return "Guten Abend"


class Orb:
    def __init__(self, services: "Services") -> None:
        self.services = services
        self.einstellungen = services.settings
        self._stimme = None

    # ------------------------------------------------------------- Stimme
    @property
    def stimme(self):
        if self._stimme is None:
            from ..adapters.voice.elevenlabs import ElevenLabsStimme
            self._stimme = ElevenLabsStimme(
                self.einstellungen.elevenlabs_api_key,
                self.einstellungen.elevenlabs_voice_id,
                modell=self.einstellungen.elevenlabs_model,
                api_base=self.einstellungen.elevenlabs_api_base,
                audio_dir=self.einstellungen.data_dir / "audio",
            )
        return self._stimme

    async def _vertonen(self, text: str) -> str:
        gesprochen = fuer_stimme(text)
        if not gesprochen or not self.stimme.verfuegbar:
            return ""
        datei = await self.stimme.datei(gesprochen)
        return f"/audio/{datei.name}" if datei else ""

    # ---------------------------------------------------------- Begruessung
    async def begruessung(self) -> OrbAntwort:
        """Was Jarvis sagt, wenn er geweckt wird."""
        jetzt = to_local(_jetzt(), self.einstellungen.tz)
        anrede = self.einstellungen.orb_anrede
        zeilen = [f"{tageszeit(jetzt)}, {anrede}. Es ist {jetzt.strftime('%H:%M')} Uhr."]

        if self.einstellungen.orb_stadt:
            from .tools_system import wetter
            wetterzeile = await wetter(self.einstellungen.orb_stadt)
            if wetterzeile:
                zeilen.append(wetterzeile + ".")

        offen = self.services.tasks.list(limit=5)
        ueberfaellig = self.services.tasks.overdue()
        if not offen:
            zeilen.append("Auf deiner Liste steht nichts Offenes.")
        else:
            titel = ", ".join(a.title for a in offen[:3])
            satz = f"{len(offen)} offene Aufgaben: {titel}"
            if len(offen) > 3:
                satz += " und weitere"
            if ueberfaellig:
                satz += f". {len(ueberfaellig)} davon ueberfaellig"
            zeilen.append(satz + ".")

        dringend = (self.services.messages.offene_dringende()
                    if self.services.messenger is not None else [])
        if dringend:
            wer = ", ".join(n.absender for n in dringend[:3])
            zeilen.append(f"Dringend offen: Nachricht von {wer}.")

        text = " ".join(zeilen)
        return OrbAntwort(text=text, gesprochen=fuer_stimme(text),
                          audio=await self._vertonen(text))

    # ------------------------------------------------------ Startaufstellung
    async def startaufstellung(self) -> OrbAntwort:
        """Doppelklatschen: Arbeitsumgebung hochfahren."""
        if not self.einstellungen.orb_aktionen:
            return OrbAntwort(text="Aktionen auf dem Rechner sind abgeschaltet.")
        gestartet: list[str] = []
        fehler: list[str] = []
        for programm in self.einstellungen.orb_programme:
            ergebnis = await self.services.toolkit.execute(
                "programm_starten", {"programm": programm}, chat_id="orb", channel="orb"
            )
            (gestartet if ergebnis.ok else fehler).append(programm)
        if self.einstellungen.orb_webseite:
            ergebnis = await self.services.toolkit.execute(
                "webseite_oeffnen", {"adresse": self.einstellungen.orb_webseite},
                chat_id="orb", channel="orb",
            )
            (gestartet if ergebnis.ok else fehler).append(self.einstellungen.orb_webseite)

        if not gestartet and not fehler:
            return OrbAntwort(text=(
                "Es ist nichts hinterlegt, was ich starten soll. "
                "Trag die Programme in ORB_PROGRAMME ein."
            ))
        begruessung = await self.begruessung()
        satz = ("Alles bereit: " + ", ".join(gestartet) + ". ") if gestartet else ""
        if fehler:
            satz += "Nicht geklappt hat: " + ", ".join(fehler) + ". "
        text = satz + begruessung.text
        self.services.memory.remember_event(
            "startaufstellung", ", ".join(gestartet), {"fehlgeschlagen": fehler}
        )
        return OrbAntwort(text=text, gesprochen=fuer_stimme(text),
                          audio=await self._vertonen(text), aktionen=gestartet)

    # ------------------------------------------------------------- Gespraech
    async def sprich(self, text: str, *, chat_id: str = "orb") -> OrbAntwort:
        """Ein gesprochener Satz geht hinein, eine gesprochene Antwort heraus."""
        satz = (text or "").strip()
        if not satz:
            return OrbAntwort(text="Ich habe nichts verstanden.")

        if self._ist_weckwort(satz):
            return await self.begruessung()

        antwort = await self.services.build_agent().handle(chat_id, satz, channel="orb")
        ergebnistext = antwort.text or "Dazu habe ich nichts."
        aktionen, ergebnistext = await self._marken_ausfuehren(ergebnistext, chat_id=chat_id)
        return OrbAntwort(
            text=ergebnistext, gesprochen=fuer_stimme(ergebnistext),
            audio=await self._vertonen(ergebnistext),
            aktionen=aktionen, werkzeuge=list(antwort.tool_names),
        )

    def _ist_weckwort(self, satz: str) -> bool:
        weckwort = (self.einstellungen.orb_weckwort or "").strip().lower()
        if not weckwort:
            return False
        geputzt = re.sub(r"[^\w\s]", "", satz.lower()).strip()
        return geputzt.startswith(weckwort) and len(geputzt) <= len(weckwort) + 12

    async def _marken_ausfuehren(self, text: str, *, chat_id: str) -> tuple[list[str], str]:
        """Fuehrt ``[AKTION:...]`` aus, das ein Modell als Text geschrieben hat."""
        treffer = list(AKTIONSMARKE.finditer(text))
        if not treffer:
            return [], text
        ausgefuehrt: list[str] = []
        ergaenzungen: list[str] = []
        for marke in treffer:
            name = marke.group(1).lower()
            argument = marke.group(2).strip().strip("\"'")
            if name not in AKTIONEN:
                continue
            werkzeug, feld = AKTIONEN[name]
            argumente = {feld: argument} if feld and argument else {}
            ergebnis = await self.services.toolkit.execute(
                werkzeug, argumente, chat_id=chat_id, channel="orb"
            )
            ausgefuehrt.append(werkzeug)
            if ergebnis.text:
                ergaenzungen.append(ergebnis.text)
        # Die Marke selbst wird nie vorgelesen.
        gekuerzt = AKTIONSMARKE.sub(" ", text).strip()
        if ergaenzungen:
            gekuerzt = (gekuerzt + "\n" + "\n".join(ergaenzungen)).strip()
        return ausgefuehrt, gekuerzt or "Erledigt."


def _jetzt() -> datetime:
    from ..db.database import utcnow
    return utcnow()
