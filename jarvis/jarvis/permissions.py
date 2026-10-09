"""Berechtigungen.

Getrennte Stufen statt eines einzigen Schalters. Die Stufen sind *nicht*
hierarchisch geordnet: wer lesen darf, darf deshalb nicht loeschen. Jede
Stufe wird einzeln erteilt.

Zwei Dinge sind bewusst nicht vorgesehen:

* JARVIS kann sich keine Stufe selbst erteilen -- es gibt keine Methode, die
  eine Berechtigung hinzufuegt. Die Richtlinie wird beim Start aus der
  Konfiguration gebaut und ist danach unveraenderlich (frozen dataclass).
* Eine Aktion, die Bestaetigung braucht, laeuft nicht einfach durch. Sie wird
  mit ``ConfirmationRequired`` abgebrochen, und die Rueckfrage geht an den
  Nutzer.
"""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class Scope(str, Enum):
    READ = "read"              # Dateien/Verzeichnisse lesen, Informationen abfragen
    CREATE = "create"          # neue Dateien, Notizen, Termine anlegen
    EDIT = "edit"              # Bestehendes aendern
    DELETE = "delete"          # Loeschen
    EXTERNAL = "external"      # Nachrichten/Anfragen nach aussen
    SYSTEM = "system"          # Systemeinstellungen, Prozesse, Skripte
    APP_CONTROL = "app_control"  # Programme starten/steuern


#: Stufen, bei denen jede einzelne Ausfuehrung ausdruecklich bestaetigt wird,
#: solange sie nicht in ``auto_confirm`` steht. Loeschen und externer Versand
#: sind nicht rueckholbar -- da fragt JARVIS.
CONFIRM_BY_DEFAULT = frozenset({Scope.DELETE, Scope.EXTERNAL, Scope.SYSTEM})


class PermissionDenied(PermissionError):
    """Die Aktion ist nicht erlaubt. Wird dem Nutzer im Klartext mitgeteilt."""


class ConfirmationRequired(Exception):
    """Die Aktion ist erlaubt, braucht aber eine ausdrueckliche Zustimmung."""

    def __init__(self, scope: Scope, description: str) -> None:
        super().__init__(description)
        self.scope = scope
        self.description = description


@dataclass(frozen=True, slots=True)
class Policy:
    """Unveraenderliche Richtlinie.

    ``roots`` begrenzt den Dateizugriff: ausserhalb dieser Verzeichnisse wird
    nicht gelesen und nicht geschrieben, auch nicht lesend.
    """

    granted: frozenset[Scope] = frozenset({Scope.READ})
    roots: tuple[Path, ...] = ()
    auto_confirm: frozenset[Scope] = frozenset()
    #: Programme, die gestartet/gesteuert werden duerfen (fnmatch-Muster).
    allowed_apps: tuple[str, ...] = ()
    #: Skripte, die ausgefuehrt werden duerfen -- absolute Pfade, keine Muster.
    allowed_scripts: tuple[Path, ...] = ()

    @classmethod
    def from_config(cls, data: dict) -> "Policy":
        scopes = frozenset(Scope(s) for s in data.get("granted", ["read"]))
        auto = frozenset(Scope(s) for s in data.get("auto_confirm", []))
        roots = tuple(Path(p).expanduser().resolve() for p in data.get("roots", []))
        scripts = tuple(Path(p).expanduser().resolve()
                        for p in data.get("allowed_scripts", []))
        return cls(
            granted=scopes,
            roots=roots,
            auto_confirm=auto,
            allowed_apps=tuple(data.get("allowed_apps", [])),
            allowed_scripts=scripts,
        )

    # -- Pruefungen -----------------------------------------------------
    def allows(self, scope: Scope) -> bool:
        return scope in self.granted

    def needs_confirmation(self, scope: Scope) -> bool:
        return scope in CONFIRM_BY_DEFAULT and scope not in self.auto_confirm

    def require(self, scope: Scope, description: str, *, confirmed: bool = False) -> None:
        """Wirft, wenn die Aktion nicht laufen darf.

        ``confirmed=True`` setzt voraus, dass der Nutzer *dieser konkreten*
        Aktion zugestimmt hat -- nicht der Stufe allgemein.
        """
        if not self.allows(scope):
            raise PermissionDenied(
                f"Dafuer fehlt mir die Berechtigung '{scope.value}'. "
                f"Gewuenscht war: {description}"
            )
        if self.needs_confirmation(scope) and not confirmed:
            raise ConfirmationRequired(scope, description)

    def check_path(self, path: str | Path, scope: Scope) -> Path:
        """Loest einen Pfad auf und prueft, ob er in einem freigegebenen
        Verzeichnis liegt.

        Aufgeloest wird mit ``resolve()``, damit ``..`` und Symlinks nicht aus
        dem freigegebenen Bereich herausfuehren.
        """
        resolved = Path(path).expanduser().resolve()
        if not self.roots:
            raise PermissionDenied(
                "Es ist kein Verzeichnis freigegeben. In der Konfiguration unter "
                "[permissions] roots eintragen."
            )
        for root in self.roots:
            if resolved == root or root in resolved.parents:
                return resolved
        erlaubt = ", ".join(str(r) for r in self.roots)
        raise PermissionDenied(
            f"{resolved} liegt ausserhalb der freigegebenen Verzeichnisse ({erlaubt})."
        )

    def check_app(self, name: str) -> str:
        if not any(fnmatch.fnmatch(name, pattern) for pattern in self.allowed_apps):
            raise PermissionDenied(
                f"'{name}' steht nicht in der Liste der freigegebenen Programme."
            )
        return name

    def check_script(self, path: str | Path) -> Path:
        resolved = Path(path).expanduser().resolve()
        if resolved not in self.allowed_scripts:
            raise PermissionDenied(
                f"{resolved} ist nicht als ausfuehrbares Skript freigegeben. "
                "Beliebige Shell-Befehle fuehrt JARVIS nicht aus."
            )
        return resolved
