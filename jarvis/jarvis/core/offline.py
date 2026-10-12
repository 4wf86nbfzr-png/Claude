"""Notfallweg: eindeutige Auftraege ohne Sprachmodell ausfuehren.

Faellt das Modell aus, soll Jarvis nicht achselzuckend dastehen. Saetze, die
unmissverstaendlich ein Auftrag sind -- "erinnere mich morgen um 9 an X",
"merk dir, dass ...", "leg eine Aufgabe an: ..." -- werden hier ohne KI
erkannt und ausgefuehrt.

Bewusst eng gehalten: lieber nichts tun und das offen sagen, als etwas
Falsches anlegen. Erkannt wird nur, was ein klares Signalwort traegt.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any
from zoneinfo import ZoneInfo

from .timeutil import parse_recurrence, parse_when, split_text_and_time

log = logging.getLogger(__name__)

#: "erinnere mich", "denk dran", "weck mich", "sag mir Bescheid"
ERINNERUNG = re.compile(
    r"\b(erinner\w*|denk\s+(?:dran|daran)|weck\s+mich|sag\s+mir\s+bescheid)\b",
    re.IGNORECASE,
)
#: "merk dir", "merke dir", "behalte"
GEDAECHTNIS = re.compile(r"\b(merk(?:e)?\s+dir|behalte?\s+(?:dir|im\s+kopf))\b", re.IGNORECASE)
#: "aufgabe", "to-do", "setz auf die liste", "ich muss ..."
AUFGABE = re.compile(
    r"\b(aufgabe|to-?do|auf\s+die\s+liste|ich\s+muss\s|wir\s+muessen\s|wir\s+müssen\s)",
    re.IGNORECASE,
)
#: "ruf mich (morgen um acht) an", "telefonisch", "per Anruf"
ANRUF = re.compile(r"\b(ruf(?:e)?\s+mich\b|telefonisch|per\s+anruf|anruf\s+erinner)",
                   re.IGNORECASE)

#: "hat mir jemand geschrieben", "neue Nachrichten", "was ist auf WhatsApp"
NACHRICHTEN = re.compile(
    r"(hat\s+(?:mir\s+)?(?:jemand|wer|einer)\s+geschrieben|"
    r"\bneue\s+nachrichten\b|\boffene\s+nachrichten\b|"
    r"\bnachrichten\s+(?:da|offen|gekommen)\b|"
    r"\bwas\s+(?:ist|war|gibt'?s)\s+(?:auf\s+)?whatsapp\b)",
    re.IGNORECASE,
)
#: "was hast du bisher gemacht", "Zwischenstand"
BERICHT = re.compile(
    r"(\bzwischenstand\b|\bhintergrundbericht\b|"
    r"was\s+hast\s+du\s+(?:\w+\s+){0,3}?(?:gemacht|getan|erledigt)|"
    r"was\s+lief\s+(?:im\s+)?hintergrund)",
    re.IGNORECASE,
)

#: Einleitungen, die vor dem eigentlichen Inhalt stehen.
VORSPANN = re.compile(
    r"^\s*(?:jarvis[,:]?\s+)?(?:bitte\s+)?"
    r"(?:ruf(?:e)?\s+mich(?:\s+\S+){0,3}?\s+an(?:\s+und)?|"
    r"erinner(?:e|st)?\s+mich(?:\s+bitte)?(?:\s+daran)?|"
    r"daran|dran|"
    r"denk\s+(?:bitte\s+)?dran|weck\s+mich|sag\s+mir\s+bescheid|"
    r"merk(?:e)?\s+dir(?:\s+bitte)?|behalte?\s+(?:dir|im\s+kopf)|"
    r"leg(?:e)?\s+(?:bitte\s+)?(?:eine\s+)?aufgabe\s+an|"
    r"neue\s+aufgabe|setz(?:e)?\s+auf\s+die\s+liste|"
    r"ich\s+muss|wir\s+muessen|wir\s+müssen)"
    r"[,:\s]*(?:dass\s+ich\s+|dass\s+|an\s+(?:den|die|das)\s+|an\s+)?",
    re.IGNORECASE,
)


@dataclass(slots=True)
class Notfallauftrag:
    """Ein ohne Modell erkannter Auftrag."""

    werkzeug: str
    argumente: dict[str, Any]
    #: Was Jarvis sagt, wenn er gar nichts ausfuehren kann.
    rueckfrage: str = ""
    #: Zusatz, den die Antwort tragen soll (z. B. "Telefonie ist aus").
    hinweis: str = ""


def _kern(text: str) -> str:
    """Entfernt die Einleitung ("erinnere mich daran, ...").

    Mehrfach, weil sich Einleitungen stapeln: "Ruf mich um 8 an und erinnere
    mich an die Planung" traegt zwei davon.
    """
    gekuerzt = text.strip()
    for _ in range(3):
        naechste = VORSPANN.sub("", gekuerzt, count=1).strip(" ,.:;-")
        if naechste == gekuerzt or not naechste:
            break
        gekuerzt = naechste
    return gekuerzt or text.strip()


def erkenne(text: str, tz: ZoneInfo, *, telefonie: bool = False) -> Notfallauftrag | None:
    """Erkennt einen eindeutigen Auftrag. ``None``, wenn nichts sicher ist."""
    satz = (text or "").strip()
    if not satz or satz.startswith("/"):
        return None

    # Nur-lesende Fragen zuerst: sie koennen nichts kaputt machen und sind
    # genau die, die ohne Modell sonst ins Leere laufen.
    if NACHRICHTEN.search(satz):
        return Notfallauftrag("nachrichten_liste", {})
    if BERICHT.search(satz):
        return Notfallauftrag("hintergrundbericht", {})

    # "Ruf mich morgen um 9 an" ist genauso eindeutig wie "erinnere mich".
    will_anruf = bool(ANRUF.search(satz))
    will_erinnerung = bool(ERINNERUNG.search(satz)) or will_anruf
    will_gedaechtnis = bool(GEDAECHTNIS.search(satz))
    will_aufgabe = bool(AUFGABE.search(satz))
    if not (will_erinnerung or will_gedaechtnis or will_aufgabe):
        return None

    rest, zeit = split_text_and_time(satz)
    inhalt = _kern(rest if zeit else satz)

    # 1) Erinnerung -- nur mit erkennbarem Zeitpunkt, sonst gezielt nachfragen.
    if will_erinnerung:
        if not zeit:
            return Notfallauftrag("", {}, rueckfrage=(
                "Wann soll ich erinnern? Nenn mir eine Zeit, zum Beispiel "
                "„morgen 8:30“ oder „in 20 Minuten“."
            ))
        if parse_when(zeit, tz) is None:
            return None
        per_telefon = will_anruf and telefonie
        return Notfallauftrag("erinnerung_anlegen", {
            "text": inhalt or satz,
            "wann": zeit,
            "wiederholung": parse_recurrence(satz),
            "kanal": "telefon" if per_telefon else "telegram",
        }, hinweis=(
            # Den Wunsch nicht stillschweigend abaendern.
            "Anrufen kann ich nicht, Telefonie ist aus — ich melde mich per Telegram."
            if (will_anruf and not telefonie) else ""
        ))

    # 2) Gedaechtnis -- "merk dir, dass ..."
    if will_gedaechtnis:
        # Hier zaehlt der ganze Satz: "Telefonate lieber vormittags" ist
        # Inhalt, keine Terminangabe, die man heraustrennen duerfte.
        inhalt = _kern(satz)
        if not inhalt:
            return None
        from .brain import parse_brain_file
        gelesen = parse_brain_file(inhalt)
        if not gelesen.entries:
            return None
        eintrag = gelesen.entries[0]
        return Notfallauftrag("gedaechtnis_merken", {
            "schluessel": eintrag.key, "wert": eintrag.value,
            "art": eintrag.kind, "wichtigkeit": eintrag.importance,
        })

    # 3) Aufgabe
    if not inhalt:
        return None
    argumente: dict[str, Any] = {"titel": inhalt}
    if zeit and parse_when(zeit, tz) is not None:
        argumente["faellig"] = zeit
    return Notfallauftrag("aufgabe_anlegen", argumente)
