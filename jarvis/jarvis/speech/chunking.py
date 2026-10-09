"""Zerlegung eines Textstroms in sprechbare Abschnitte.

Damit JARVIS sprechen kann, bevor die Antwort fertig ist, muss aus dem
stueckweise ankommenden Text entschieden werden, wann ein Abschnitt
abgeschlossen ist. Zu frueh getrennt klingt zerhackt, zu spaet getrennt kostet
Reaktionszeit.

Deutsche Besonderheiten, die hier abgefangen werden:

* ``z.B.``, ``u.a.``, ``Dr.``, ``Nr.`` sind keine Satzenden.
* ``1. Januar`` und ``3.000`` sind keine Satzenden.
* Der erste Abschnitt darf kuerzer sein als die folgenden: er entscheidet die
  wahrgenommene Reaktionszeit. Spaeter sind laengere Abschnitte besser, weil
  jede Grenze eine kleine Fuge in der Sprachausgabe ist.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

#: Abkuerzungen, nach denen kein Satz endet. Ohne Punkt gespeichert.
ABKUERZUNGEN = {
    "z", "b", "zb", "bzw", "usw", "etc", "ca", "evtl", "ggf", "inkl", "exkl",
    "max", "min", "Nr", "nr", "Dr", "dr", "Prof", "prof", "Hr", "Fr", "Str",
    "u", "a", "ua", "dh", "idr", "va", "sog", "vgl", "bspw", "Abs", "Art",
    "Mio", "Mrd", "Tsd", "Jan", "Feb", "Mrz", "Apr", "Jun", "Jul", "Aug",
    "Sep", "Okt", "Nov", "Dez", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So",
}

#: Satzzeichen, die einen Abschnitt beenden duerfen.
ENDE = ".!?:;"
#: Schwaechere Grenzen -- nur genutzt, wenn ein Abschnitt sonst zu lang wird.
NOTGRENZE = ",-–—"

_NUR_ZIFFERN = re.compile(r"\d+$")


@dataclass(slots=True)
class ChunkConfig:
    #: Der erste Abschnitt darf so kurz sein -- er bestimmt die Reaktionszeit.
    first_min_chars: int = 25
    #: Spaetere Abschnitte sollen mindestens so lang sein.
    min_chars: int = 80
    #: Ab hier wird auch an einer Notgrenze getrennt, damit nichts haengt.
    max_chars: int = 320


@dataclass(slots=True)
class SentenceBuffer:
    """Sammelt Text und gibt sprechbare Abschnitte heraus."""

    config: ChunkConfig = field(default_factory=ChunkConfig)
    _rest: str = ""
    _ausgegeben: int = 0

    def feed(self, text: str) -> list[str]:
        """Nimmt ein Textstueck und gibt fertige Abschnitte zurueck."""
        self._rest += text
        fertig: list[str] = []
        while (abschnitt := self._schneiden()) is not None:
            fertig.append(abschnitt)
        return fertig

    def flush(self) -> str | None:
        """Gibt den Rest heraus -- am Ende der Antwort."""
        rest = self._rest.strip()
        self._rest = ""
        if rest:
            self._ausgegeben += 1
            return rest
        return None

    def reset(self) -> None:
        self._rest = ""
        self._ausgegeben = 0

    # -- intern ---------------------------------------------------------
    @property
    def _mindestlaenge(self) -> int:
        return (self.config.first_min_chars if self._ausgegeben == 0
                else self.config.min_chars)

    def _schneiden(self) -> str | None:
        text = self._rest
        if not text.strip():
            return None

        grenze = self._satzgrenze(text)
        if grenze is not None and grenze >= self._mindestlaenge:
            return self._abschneiden(grenze)

        # Nichts gefunden, aber der Abschnitt wird zu lang: an einer
        # schwaecheren Grenze trennen, damit die Ausgabe nicht wartet.
        if len(text) >= self.config.max_chars:
            notgrenze = self._notgrenze(text)
            return self._abschneiden(notgrenze or self.config.max_chars)
        return None

    def _abschneiden(self, position: int) -> str:
        abschnitt = self._rest[:position].strip()
        self._rest = self._rest[position:].lstrip()
        self._ausgegeben += 1
        return abschnitt

    def _satzgrenze(self, text: str) -> int | None:
        """Erste echte Satzgrenze, oder ``None``."""
        for index, zeichen in enumerate(text):
            if zeichen not in ENDE:
                continue
            # Nach dem Satzzeichen muss Platz oder Zeilenende folgen --
            # sonst ist es eine Zahl wie 3.000 oder eine Adresse.
            nach = text[index + 1:index + 2]
            if nach and not nach.isspace():
                continue
            if zeichen == "." and self._ist_abkuerzung(text, index):
                continue
            # Mehrere Satzzeichen zusammen ("?!") gemeinsam nehmen.
            ende = index + 1
            while ende < len(text) and text[ende] in ENDE:
                ende += 1
            return ende
        return None

    def _ist_abkuerzung(self, text: str, punkt: int) -> bool:
        """Prueft, ob der Punkt zu einer Abkuerzung oder Zahl gehoert."""
        anfang = punkt
        while anfang > 0 and (text[anfang - 1].isalnum()):
            anfang -= 1
        wort = text[anfang:punkt]
        if not wort:
            return False
        if wort in ABKUERZUNGEN:
            return True
        # Eine einzelne Ziffer oder Zahl: '1. Januar', '3.000'.
        if _NUR_ZIFFERN.match(wort):
            return True
        # Ein einzelner Buchstabe ist fast immer eine Initiale ('M. Herm').
        return len(wort) == 1 and wort.isalpha()

    def _notgrenze(self, text: str) -> int | None:
        """Letzte schwache Grenze vor ``max_chars``."""
        fenster = text[:self.config.max_chars]
        for index in range(len(fenster) - 1, self.config.min_chars, -1):
            if fenster[index] in NOTGRENZE and fenster[index + 1:index + 2].isspace():
                return index + 1
        # Sonst am letzten Wortende trennen, nicht mitten im Wort.
        luecke = fenster.rfind(" ")
        return luecke + 1 if luecke > self.config.min_chars else None
