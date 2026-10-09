"""Dateiwerkzeuge.

Jeder Pfad laeuft durch ``policy.check_path`` -- ausserhalb der freigegebenen
Wurzeln geht nichts, auch nicht lesend. Die Werkzeuge sind
plattformunabhaengig und lassen sich deshalb vollstaendig testen.

Gelesen wird mit Groessenbegrenzung: eine 4-GB-Datei soll nicht in den
Modellkontext wandern, und eine Binaerdatei hat dort nichts zu suchen.
"""

from __future__ import annotations

import fnmatch
from pathlib import Path

from ..logging_setup import get_logger
from ..permissions import Policy, Scope
from .registry import Param, Tool, ToolResult

log = get_logger("tools.files")

#: Mehr als das wird nicht gelesen -- der Rest wird abgeschnitten und gesagt.
MAX_READ_BYTES = 200_000
#: Treffergrenze fuer Verzeichnislisten und Suche.
MAX_HITS = 200

#: Endungen, die als Text gelten. Alles andere wird nicht gelesen, statt
#: Steuerzeichen ins Modell zu schieben.
TEXT_SUFFIXES = {
    ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".toml", ".yaml", ".yml",
    ".ini", ".cfg", ".conf", ".log", ".py", ".js", ".ts", ".html", ".htm", ".css",
    ".xml", ".sql", ".sh", ".rst", ".tex", ".vtt", ".srt", "",
}


def register(registry, policy: Policy) -> None:
    """Meldet die Dateiwerkzeuge an.

    Werkzeuge, fuer die die Stufe fehlt, werden nicht angemeldet -- so sieht
    das Modell gar nicht erst, was es nicht darf.
    """

    def _read(pfad: str, max_zeichen: int = 20_000) -> ToolResult:
        ziel = policy.check_path(pfad, Scope.READ)
        if not ziel.exists():
            return ToolResult(ok=False, message=f"{ziel} gibt es nicht.")
        if ziel.is_dir():
            return ToolResult(ok=False,
                              message=f"{ziel} ist ein Ordner. Nutze 'ordner_auflisten'.")
        if ziel.suffix.lower() not in TEXT_SUFFIXES:
            return ToolResult(
                ok=False,
                message=f"{ziel.name} sieht nicht nach Text aus ({ziel.suffix}). "
                        "Ich lese nur Textdateien.")
        groesse = ziel.stat().st_size
        grenze = min(int(max_zeichen), MAX_READ_BYTES)
        try:
            with ziel.open("r", encoding="utf-8", errors="replace") as datei:
                inhalt = datei.read(grenze + 1)
        except OSError as exc:
            return ToolResult(ok=False, message=f"{ziel} liess sich nicht lesen: {exc}")
        gekuerzt = len(inhalt) > grenze
        if gekuerzt:
            inhalt = inhalt[:grenze]
        hinweis = f" (gekuerzt, Datei ist {groesse} Byte)" if gekuerzt else ""
        return ToolResult(
            ok=True, value=inhalt + hinweis,
            verification=f"{ziel} gelesen, {len(inhalt)} Zeichen{hinweis}",
        )

    def _list(pfad: str, muster: str = "*") -> ToolResult:
        ziel = policy.check_path(pfad, Scope.READ)
        if not ziel.is_dir():
            return ToolResult(ok=False, message=f"{ziel} ist kein Ordner.")
        try:
            eintraege = sorted(ziel.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except OSError as exc:
            return ToolResult(ok=False, message=f"{ziel} liess sich nicht lesen: {exc}")
        # Versteckte Dateien nur, wenn ausdruecklich danach gesucht wird.
        if not muster.startswith("."):
            eintraege = [p for p in eintraege if not p.name.startswith(".")]
        treffer = [p for p in eintraege if fnmatch.fnmatch(p.name, muster)]
        gekuerzt = len(treffer) > MAX_HITS
        zeilen = [f"{'[Ordner] ' if p.is_dir() else ''}{p.name}" for p in treffer[:MAX_HITS]]
        return ToolResult(
            ok=True,
            value="\n".join(zeilen) or "(leer)",
            verification=f"{ziel} aufgelistet, {len(treffer)} Treffer"
                         + (f", gezeigt {MAX_HITS}" if gekuerzt else ""),
        )

    def _find(pfad: str, muster: str) -> ToolResult:
        """Sucht nach Dateinamen, rekursiv."""
        wurzel = policy.check_path(pfad, Scope.READ)
        if not wurzel.is_dir():
            return ToolResult(ok=False, message=f"{wurzel} ist kein Ordner.")
        treffer: list[Path] = []
        for kandidat in wurzel.rglob("*"):
            if any(teil.startswith(".") for teil in kandidat.relative_to(wurzel).parts):
                continue
            if fnmatch.fnmatch(kandidat.name.lower(), muster.lower()):
                treffer.append(kandidat)
                if len(treffer) >= MAX_HITS:
                    break
        return ToolResult(
            ok=True,
            value="\n".join(str(p.relative_to(wurzel)) for p in treffer) or "(nichts gefunden)",
            verification=f"{wurzel} durchsucht nach '{muster}', {len(treffer)} Treffer",
        )

    def _grep(pfad: str, text: str) -> ToolResult:
        """Sucht Text in Textdateien unterhalb eines Ordners."""
        wurzel = policy.check_path(pfad, Scope.READ)
        gesucht = text.lower()
        treffer: list[str] = []
        dateien = [wurzel] if wurzel.is_file() else [
            p for p in wurzel.rglob("*")
            if p.is_file() and p.suffix.lower() in TEXT_SUFFIXES
            and not any(t.startswith(".") for t in p.parts)
        ]
        for datei in dateien:
            try:
                with datei.open("r", encoding="utf-8", errors="replace") as fh:
                    for nummer, zeile in enumerate(fh, start=1):
                        if gesucht in zeile.lower():
                            kurz = zeile.strip()[:160]
                            name = datei.name if wurzel.is_file() else datei.relative_to(wurzel)
                            treffer.append(f"{name}:{nummer}: {kurz}")
                            if len(treffer) >= MAX_HITS:
                                break
            except OSError:
                continue
            if len(treffer) >= MAX_HITS:
                break
        return ToolResult(
            ok=True,
            value="\n".join(treffer) or "(nicht gefunden)",
            verification=f"{len(dateien)} Datei(en) durchsucht, {len(treffer)} Treffer",
        )

    def _write(pfad: str, inhalt: str) -> ToolResult:
        """Schreibt eine neue Datei. Bestehende werden nicht ueberschrieben --
        dafuer gibt es 'datei_aendern'."""
        ziel = policy.check_path(pfad, Scope.CREATE)
        if ziel.exists():
            return ToolResult(
                ok=False,
                message=f"{ziel} gibt es schon. Zum Aendern 'datei_aendern' nutzen.")
        try:
            ziel.parent.mkdir(parents=True, exist_ok=True)
            ziel.write_text(inhalt, encoding="utf-8")
            # Nach dem Schreiben nachlesen: nur so ist der Pruefvermerk echt.
            geschrieben = ziel.read_text(encoding="utf-8")
        except OSError as exc:
            return ToolResult(ok=False, message=f"{ziel} liess sich nicht schreiben: {exc}")
        if geschrieben != inhalt:
            return ToolResult(ok=False,
                              message=f"{ziel} wurde geschrieben, stimmt aber nicht mit "
                                      "der Vorlage ueberein.")
        return ToolResult(ok=True, value=str(ziel),
                          verification=f"{ziel} geschrieben und nachgelesen, "
                                       f"{len(geschrieben)} Zeichen")

    def _append(pfad: str, inhalt: str) -> ToolResult:
        ziel = policy.check_path(pfad, Scope.EDIT)
        if not ziel.exists():
            return ToolResult(ok=False, message=f"{ziel} gibt es nicht.")
        vorher = ziel.stat().st_size
        try:
            with ziel.open("a", encoding="utf-8") as datei:
                datei.write(inhalt)
        except OSError as exc:
            return ToolResult(ok=False, message=f"{ziel}: {exc}")
        nachher = ziel.stat().st_size
        return ToolResult(ok=True, value=str(ziel),
                          verification=f"{ziel} von {vorher} auf {nachher} Byte gewachsen")

    def _replace(pfad: str, suchen: str, ersetzen: str) -> ToolResult:
        """Ersetzt Text in einer Datei. Kommt die Vorlage nicht genau einmal
        vor, wird nichts geaendert -- sonst trifft es die falsche Stelle."""
        ziel = policy.check_path(pfad, Scope.EDIT)
        if not ziel.exists():
            return ToolResult(ok=False, message=f"{ziel} gibt es nicht.")
        try:
            alt = ziel.read_text(encoding="utf-8")
        except OSError as exc:
            return ToolResult(ok=False, message=f"{ziel}: {exc}")
        anzahl = alt.count(suchen)
        if anzahl == 0:
            return ToolResult(ok=False, message=f"'{suchen}' steht nicht in {ziel.name}.")
        if anzahl > 1:
            return ToolResult(
                ok=False,
                message=f"'{suchen}' steht {anzahl}-mal in {ziel.name}. "
                        "Ich aendere nur eindeutige Stellen.")
        neu = alt.replace(suchen, ersetzen)
        try:
            ziel.write_text(neu, encoding="utf-8")
            kontrolle = ziel.read_text(encoding="utf-8")
        except OSError as exc:
            return ToolResult(ok=False, message=f"{ziel}: {exc}")
        if kontrolle != neu:
            return ToolResult(ok=False, message=f"{ziel} stimmt nach dem Schreiben nicht.")
        return ToolResult(ok=True, value=str(ziel),
                          verification=f"{ziel}: eine Stelle ersetzt und nachgelesen")

    def _delete(pfad: str) -> ToolResult:
        ziel = policy.check_path(pfad, Scope.DELETE)
        if not ziel.exists():
            return ToolResult(ok=False, message=f"{ziel} gibt es nicht.")
        if ziel.is_dir():
            return ToolResult(ok=False,
                              message=f"{ziel} ist ein Ordner. Ordner loesche ich nicht.")
        try:
            ziel.unlink()
        except OSError as exc:
            return ToolResult(ok=False, message=f"{ziel}: {exc}")
        # Pruefen, dass sie wirklich weg ist.
        if ziel.exists():
            return ToolResult(ok=False, message=f"{ziel} ist noch da.")
        return ToolResult(ok=True, value=str(ziel),
                          verification=f"{ziel} geloescht, Pfad existiert nicht mehr")

    def _info(pfad: str) -> ToolResult:
        ziel = policy.check_path(pfad, Scope.READ)
        if not ziel.exists():
            return ToolResult(ok=False, message=f"{ziel} gibt es nicht.")
        s = ziel.stat()
        art = "Ordner" if ziel.is_dir() else "Datei"
        return ToolResult(
            ok=True,
            value=f"{art}, {s.st_size} Byte, geaendert {int(s.st_mtime)}",
            verification=f"{ziel} abgefragt",
        )

    beschreibungen = [
        ("datei_lesen", "Liest eine Textdatei und gibt den Inhalt zurueck.",
         Scope.READ, {"pfad": Param(str, description="Pfad zur Datei"),
                      "max_zeichen": Param(int, required=False, default=20_000,
                                           description="Obergrenze")}, _read),
        ("ordner_auflisten", "Listet den Inhalt eines Ordners.",
         Scope.READ, {"pfad": Param(str, description="Pfad zum Ordner"),
                      "muster": Param(str, required=False, default="*",
                                      description="Namensmuster, z.B. *.pdf")}, _list),
        ("datei_suchen", "Sucht Dateien nach Namensmuster, auch in Unterordnern.",
         Scope.READ, {"pfad": Param(str, description="Startordner"),
                      "muster": Param(str, description="z.B. *angebot*.pdf")}, _find),
        ("text_suchen", "Sucht einen Text in Dateien unterhalb eines Ordners.",
         Scope.READ, {"pfad": Param(str, description="Ordner oder Datei"),
                      "text": Param(str, description="Gesuchter Text")}, _grep),
        ("datei_info", "Groesse und Aenderungszeit einer Datei.",
         Scope.READ, {"pfad": Param(str)}, _info),
        ("datei_schreiben", "Legt eine neue Textdatei an.",
         Scope.CREATE, {"pfad": Param(str), "inhalt": Param(str)}, _write),
        ("datei_anhaengen", "Haengt Text an eine bestehende Datei an.",
         Scope.EDIT, {"pfad": Param(str), "inhalt": Param(str)}, _append),
        ("datei_aendern", "Ersetzt eine eindeutige Textstelle in einer Datei.",
         Scope.EDIT, {"pfad": Param(str), "suchen": Param(str), "ersetzen": Param(str)},
         _replace),
        ("datei_loeschen", "Loescht eine Datei. Fragt vorher nach.",
         Scope.DELETE, {"pfad": Param(str)}, _delete),
    ]

    for name, beschreibung, scope, params, funktion in beschreibungen:
        if not policy.allows(scope):
            continue
        registry.add(Tool(name=name, description=beschreibung, scope=scope,
                          params=params, func=funktion))
