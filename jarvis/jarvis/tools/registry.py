"""Werkzeugverzeichnis und Ausfuehrung.

Jedes Werkzeug meldet sich mit Namen, Beschreibung, benoetigter
Berechtigungsstufe und einem Argumentschema an. Das Schema ist absichtlich
klein gehalten (Typ, Pflicht, Vorgabe) -- es soll Tippfehler und
Modell-Halluzinationen abfangen, nicht JSON Schema nachbauen.

Zwei Eigenschaften sind fuer JARVIS wesentlich:

* **Unbekanntes Werkzeug ergibt einen Fehler, kein erfundenes Ergebnis.**
  ``ToolNotAvailable`` nennt, was fehlt, und wird dem Nutzer so mitgeteilt.
* **Ein Werkzeug, dessen Voraussetzungen fehlen** (kein macOS, kein
  Zugangsschluessel), meldet sich als ``unavailable`` mit Grund -- es wird gar
  nicht erst angeboten.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any, Callable

from ..permissions import ConfirmationRequired, PermissionDenied, Policy, Scope


class ToolError(RuntimeError):
    """Das Werkzeug lief, kam aber nicht zum Ergebnis."""


class ToolNotAvailable(ToolError):
    """Es gibt das Werkzeug nicht oder seine Voraussetzungen fehlen."""


class ArgumentError(ToolError):
    """Die Argumente passen nicht zum Schema."""


@dataclass(slots=True)
class Param:
    type: type
    required: bool = True
    default: Any = None
    description: str = ""


@dataclass(slots=True)
class ToolResult:
    """Ergebnis eines Werkzeugaufrufs.

    ``verification`` ist der Pruefvermerk, den der Aufgabenmanager fuer
    ``complete()`` verlangt. Ein Werkzeug, das nichts pruefen kann, laesst das
    Feld leer -- dann kann die Aufgabe nicht als erledigt gelten.
    """

    ok: bool
    value: Any = None
    verification: str = ""
    message: str = ""

    def __bool__(self) -> bool:
        return self.ok


@dataclass(slots=True)
class Tool:
    name: str
    description: str
    scope: Scope
    params: dict[str, Param]
    func: Callable[..., ToolResult]
    #: Grund, falls das Werkzeug hier nicht einsatzbereit ist (z.B. "nur macOS").
    unavailable_reason: str | None = None

    @property
    def available(self) -> bool:
        return self.unavailable_reason is None

    def signature(self) -> dict:
        """Beschreibung fuer den Werkzeugaufruf des Sprachmodells."""
        return {
            "name": self.name,
            "description": self.description,
            "scope": self.scope.value,
            "parameters": {
                key: {
                    "type": p.type.__name__,
                    "required": p.required,
                    "description": p.description,
                }
                for key, p in self.params.items()
            },
        }


class ToolRegistry:
    """Haelt die Werkzeuge und fuehrt sie unter der Richtlinie aus."""

    def __init__(self, policy: Policy) -> None:
        self.policy = policy
        self._tools: dict[str, Tool] = {}

    # -- Registrierung --------------------------------------------------
    def register(self, name: str, description: str, scope: Scope,
                 params: dict[str, Param] | None = None,
                 unavailable_reason: str | None = None):
        """Dekorator zum Anmelden eines Werkzeugs."""

        def decorator(func: Callable[..., ToolResult]) -> Callable[..., ToolResult]:
            if name in self._tools:
                raise ValueError(f"Werkzeug '{name}' ist schon angemeldet.")
            self._tools[name] = Tool(
                name=name, description=description, scope=scope,
                params=params or {}, func=func,
                unavailable_reason=unavailable_reason,
            )
            return func

        return decorator

    def add(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    # -- Abfrage --------------------------------------------------------
    def available(self) -> list[Tool]:
        """Nur Werkzeuge, die hier wirklich laufen koennen *und* erlaubt sind.

        Was dem Modell nicht angeboten wird, kann es auch nicht halluzinieren.
        """
        return [t for t in self._tools.values()
                if t.available and self.policy.allows(t.scope)]

    def all(self) -> list[Tool]:
        return list(self._tools.values())

    def describe(self) -> list[dict]:
        return [t.signature() for t in self.available()]

    def get(self, name: str) -> Tool:
        tool = self._tools.get(name)
        if tool is None:
            bekannt = ", ".join(sorted(t.name for t in self.available())) or "keine"
            raise ToolNotAvailable(
                f"Ein Werkzeug '{name}' habe ich nicht. Verfuegbar: {bekannt}."
            )
        if not tool.available:
            raise ToolNotAvailable(
                f"'{name}' ist hier nicht einsatzbereit: {tool.unavailable_reason}"
            )
        return tool

    # -- Ausfuehrung ----------------------------------------------------
    def validate(self, tool: Tool, args: dict) -> dict:
        """Prueft und normalisiert Argumente. Unbekannte Schluessel sind ein
        Fehler -- sie deuten auf ein missverstandenes Werkzeug hin."""
        unbekannt = set(args) - set(tool.params)
        if unbekannt:
            raise ArgumentError(
                f"{tool.name}: unbekannte Argumente {sorted(unbekannt)}. "
                f"Erwartet werden {sorted(tool.params)}."
            )
        geprueft: dict[str, Any] = {}
        for key, spec in tool.params.items():
            if key not in args:
                if spec.required:
                    raise ArgumentError(f"{tool.name}: '{key}' fehlt ({spec.description}).")
                geprueft[key] = spec.default
                continue
            value = args[key]
            if spec.type is float and isinstance(value, int) and not isinstance(value, bool):
                value = float(value)
            # bool ist in Python eine Unterklasse von int -- ohne diese Zeile
            # ginge True als Zahl durch und landete als 1 im Werkzeug.
            if spec.type is int and isinstance(value, bool):
                raise ArgumentError(
                    f"{tool.name}: '{key}' muss eine Zahl sein, bekommen habe "
                    "ich einen Wahrheitswert.")
            if not isinstance(value, spec.type):
                raise ArgumentError(
                    f"{tool.name}: '{key}' muss {spec.type.__name__} sein, "
                    f"bekommen habe ich {type(value).__name__}."
                )
            geprueft[key] = value
        return geprueft

    def call(self, name: str, args: dict | None = None, *, confirmed: bool = False) -> ToolResult:
        """Fuehrt ein Werkzeug aus.

        Reihenfolge ist bewusst: erst Existenz, dann Argumente, dann
        Berechtigung. So erfaehrt der Nutzer bei einem falsch verstandenen
        Aufruf den Argumentfehler und nicht eine irrefuehrende Rueckfrage
        nach einer Freigabe.
        """
        tool = self.get(name)
        geprueft = self.validate(tool, args or {})
        beschreibung = f"{tool.name}({', '.join(f'{k}={v!r}' for k, v in geprueft.items())})"
        self.policy.require(tool.scope, beschreibung, confirmed=confirmed)

        try:
            result = tool.func(**geprueft)
        except (PermissionDenied, ConfirmationRequired):
            raise
        except Exception as exc:  # noqa: BLE001 -- ein Werkzeug darf JARVIS nicht abschiessen
            return ToolResult(ok=False, message=f"{tool.name} ist gescheitert: {exc}")

        if not isinstance(result, ToolResult):
            raise ToolError(
                f"{tool.name} muss ein ToolResult zurueckgeben, nicht {type(result).__name__}."
            )
        return result
