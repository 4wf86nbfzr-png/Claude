"""Gehirn-Datei einlesen.

Eine einfache Textdatei, in der steht, wer der Nutzer ist, wie er arbeitet
und was dauerhaft gelten soll. Sie wird in das Langzeitgedaechtnis
uebernommen -- entweder mit ``jarvis lernen`` oder indem man die Datei in
Telegram an den Bot schickt.

Format, bewusst schlicht gehalten (man soll es ohne Anleitung hinkriegen):

    # Wer ich bin                 <- Ueberschrift = Art des Eintrags
    Name: Maik Herm               <- Schluessel: Wert
    !! Firma: HERM Service Team   <- ! wichtig (4), !! immer mitdenken (5)
    - Buero: Hamburg              <- Aufzaehlungsstrich ist erlaubt
    > Das hier ist ein Kommentar  <- wird nicht gelernt
    Lieblingscafe: <ausfuellen>   <- unausgefuellt, wird uebersprungen

Gleicher Schluessel ueberschreibt den alten Wert; die Datei ist damit die
Quelle der Wahrheit und kann jederzeit erneut eingelesen werden.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .memory import Memory

log = logging.getLogger(__name__)

#: Ueberschrift -> Art des Gedaechtniseintrags.
HEADING_KINDS: list[tuple[tuple[str, ...], str]] = [
    (("wer ich bin", "ueber mich", "uber mich", "person", "grunddaten"), "fakt"),
    (("vorlieb", "gewohnheit", "wie ich", "kommunikation", "tonfall"), "vorliebe"),
    (("ablauf", "ablaufe", "ablaeufe", "routine", "arbeitsweise", "regel", "woche",
      "tagesablauf"), "ablauf"),
    (("projekt", "vorhaben", "kunde", "auftrag", "baustelle"), "projekt"),
    (("mensch", "kontakt", "team", "familie", "wer ist wer"), "fakt"),
]

#: Platzhalter, die beim Einlesen uebersprungen werden: alles, was vollstaendig
#: in spitzen oder eckigen Klammern steht ("<dein Name>", "[noch offen]").
#: Dadurch lernt Jarvis nie eine Vorlagenzeile als Tatsache.
PLACEHOLDER = re.compile(r"^\s*[<\[]\s*[^<>\[\]]*\s*[>\]]\s*$")
MAX_KEY = 120
MAX_VALUE = 1500


@dataclass(slots=True)
class BrainEntry:
    key: str
    value: str
    kind: str = "fakt"
    importance: int = 3
    line: int = 0

    def line_text(self) -> str:
        marke = {5: "!!", 4: "!"}.get(self.importance, "  ")
        return f"{marke} {self.key}: {self.value}"


@dataclass(slots=True)
class BrainFile:
    entries: list[BrainEntry] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.entries)

    def by_kind(self) -> dict[str, list[BrainEntry]]:
        gruppen: dict[str, list[BrainEntry]] = {}
        for eintrag in self.entries:
            gruppen.setdefault(eintrag.kind, []).append(eintrag)
        return gruppen


def _ohne_umlaute(text: str) -> str:
    """Umlaute vereinheitlichen -- "Abläufe" soll wie "ablaufe" treffen."""
    for von, nach in (("ä", "a"), ("ö", "o"), ("ü", "u"), ("ß", "ss")):
        text = text.replace(von, nach)
    return text


def kind_for_heading(heading: str) -> str:
    text = _ohne_umlaute(heading.strip().lower())
    for stichworte, art in HEADING_KINDS:
        if any(_ohne_umlaute(wort) in text for wort in stichworte):
            return art
    return "fakt"


def _derive_key(text: str) -> str:
    """Schluessel aus einem Satz ohne Doppelpunkt ableiten."""
    worte = re.split(r"\s+", text.strip())
    schluessel = " ".join(worte[:5]).rstrip(".,;:!?")
    return schluessel[:MAX_KEY] or text[:MAX_KEY]


def parse_brain_file(inhalt: str) -> BrainFile:
    """Liest den Dateiinhalt. Wirft nicht -- Unklares landet in ``skipped``."""
    ergebnis = BrainFile()
    aktuelle_art = "fakt"
    gesehen: dict[str, int] = {}

    for nummer, rohzeile in enumerate(inhalt.replace("\r", "").split("\n"), start=1):
        zeile = rohzeile.strip()
        if not zeile:
            continue
        if zeile.startswith(">"):                      # Kommentar
            continue
        if zeile.startswith("#"):                      # Ueberschrift
            aktuelle_art = kind_for_heading(zeile.lstrip("# "))
            continue
        if set(zeile) <= {"-", "=", "_", "*"} and len(zeile) > 2:
            continue                                   # Trennlinie

        # Aufzaehlungsstriche und Wichtigkeitsmarken abtrennen.
        zeile = re.sub(r"^[-*•]\s*", "", zeile)
        wichtigkeit = 3
        marke = re.match(r"^(!{1,3})\s*", zeile)
        if marke:
            wichtigkeit = min(5, 3 + len(marke.group(1)))
            zeile = zeile[marke.end():]
        zeile = zeile.strip()
        if not zeile:
            continue

        if ":" in zeile:
            schluessel, _, wert = zeile.partition(":")
            schluessel = schluessel.strip()
            wert = wert.strip()
        else:
            schluessel = _derive_key(zeile)
            wert = zeile

        if not wert:
            ergebnis.skipped.append(f"Zeile {nummer}: ohne Inhalt -- {rohzeile.strip()[:60]}")
            continue
        if PLACEHOLDER.match(wert) or PLACEHOLDER.match(schluessel):
            ergebnis.skipped.append(
                f"Zeile {nummer}: noch nicht ausgefuellt -- "
                f"{schluessel if not PLACEHOLDER.match(schluessel) else rohzeile.strip()[:60]}"
            )
            continue
        if not schluessel:
            schluessel = _derive_key(wert)

        schluessel = schluessel[:MAX_KEY]
        wert = wert[:MAX_VALUE]

        if schluessel in gesehen:
            ergebnis.warnings.append(
                f"'{schluessel}' steht mehrfach drin (Zeile {gesehen[schluessel]} "
                f"und {nummer}) -- der letzte Wert gilt."
            )
            ergebnis.entries = [e for e in ergebnis.entries if e.key != schluessel]
        gesehen[schluessel] = nummer

        if re.search(r"<[^<>]{2,}>", wert):
            # Teilweise ausgefuellt: wird gelernt, aber angemerkt -- sonst
            # merkt sich Jarvis stillschweigend ein Stueck Vorlage.
            ergebnis.warnings.append(
                f"Zeile {nummer}: '{schluessel}' enthaelt noch eine Klammer "
                "aus der Vorlage."
            )

        ergebnis.entries.append(BrainEntry(
            key=schluessel, value=wert, kind=aktuelle_art,
            importance=wichtigkeit, line=nummer,
        ))

    if not ergebnis.entries:
        ergebnis.warnings.append(
            "In der Datei stand nichts Lernbares. Format: 'Schluessel: Wert', "
            "eine Zeile je Punkt."
        )
    return ergebnis


@dataclass(slots=True)
class ImportResult:
    neu: int = 0
    geaendert: int = 0
    unveraendert: int = 0
    fehler: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.neu + self.geaendert + self.unveraendert

    def summary(self) -> str:
        teile = []
        if self.neu:
            teile.append(f"{self.neu} neu")
        if self.geaendert:
            teile.append(f"{self.geaendert} aktualisiert")
        if self.unveraendert:
            teile.append(f"{self.unveraendert} unveraendert")
        if not teile:
            teile.append("nichts uebernommen")
        return ", ".join(teile)


def import_entries(memory: "Memory", eintraege: list[BrainEntry],
                   *, source: str = "gehirn-datei") -> ImportResult:
    """Uebernimmt die Eintraege ins Langzeitgedaechtnis."""
    ergebnis = ImportResult()
    for eintrag in eintraege:
        vorher = memory.get_memory_by_key(eintrag.key)
        try:
            memory.remember(
                eintrag.key, eintrag.value, kind=eintrag.kind,
                importance=eintrag.importance, source=source,
            )
        except ValueError as fehler:
            ergebnis.fehler.append(f"{eintrag.key}: {fehler}")
            continue
        if vorher is None:
            ergebnis.neu += 1
        elif vorher.value != eintrag.value or vorher.importance != eintrag.importance:
            ergebnis.geaendert += 1
        else:
            ergebnis.unveraendert += 1
    if ergebnis.total:
        memory.remember_event(
            "gehirn_gelernt", source,
            {"neu": ergebnis.neu, "geaendert": ergebnis.geaendert,
             "unveraendert": ergebnis.unveraendert},
        )
    return ergebnis


def format_preview(datei: BrainFile, *, limit: int = 12) -> str:
    """Kurze Vorschau fuer Telegram oder Konsole."""
    zeilen = [f"*{datei.count} Punkte* gefunden:"]
    namen = {"fakt": "Wer ich bin", "vorliebe": "Vorlieben",
             "ablauf": "Abläufe", "projekt": "Projekte"}
    gezeigt = 0
    for art, eintraege in datei.by_kind().items():
        zeilen.append(f"\n_{namen.get(art, art)}_ ({len(eintraege)})")
        for eintrag in eintraege:
            if gezeigt >= limit:
                break
            marke = "‼️" if eintrag.importance >= 5 else ("❗" if eintrag.importance == 4 else "•")
            zeilen.append(f"{marke} {eintrag.key}: {eintrag.value[:90]}")
            gezeigt += 1
    if datei.count > gezeigt:
        zeilen.append(f"\n… und {datei.count - gezeigt} weitere.")
    if datei.skipped:
        zeilen.append(f"\n_{len(datei.skipped)} Zeile(n) übersprungen_ "
                      "(leer oder noch nicht ausgefüllt).")
    for warnung in datei.warnings[:3]:
        zeilen.append(f"⚠️ {warnung}")
    return "\n".join(zeilen)
