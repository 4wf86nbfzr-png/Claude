"""Werkzeugschicht.

Ein Werkzeug ist eine Funktion mit Namen, Beschreibung und JSON-Schema.
Dasselbe Werkzeug wird vom Sprachmodell, von Telegram-Knoepfen, vom
Telefonassistenten und vom Dashboard benutzt -- es gibt keine zweite
Umsetzung "nur fuer den Chat".

Jeder Aufruf wird protokolliert (Tabelle ``tool_call``), bekommt eine
Zeitgrenze und faellt bei einem Fehler nicht durch, sondern liefert eine
verstaendliche Fehlermeldung zurueck. So kann das Modell darauf reagieren,
statt das Gespraech abzubrechen.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from ..ai.provider import ToolSpec
from ..db.database import Database, iso, utcnow
from ..errors import JarvisError, PermissionDenied

log = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 60.0


@dataclass(slots=True)
class ToolResult:
    """Ergebnis eines Werkzeugaufrufs."""

    ok: bool
    text: str
    data: dict[str, Any] = field(default_factory=dict)
    #: Gesetzt, wenn die Aktion auf eine Bestaetigung wartet.
    confirmation_token: str = ""
    #: Vorschlag fuer Telegram-Knoepfe (wird vom Adapter uebersetzt).
    buttons: list[tuple[str, str]] = field(default_factory=list)

    def for_model(self) -> str:
        """Was das Sprachmodell als Werkzeugergebnis sieht."""
        payload: dict[str, Any] = {"erfolg": self.ok, "ergebnis": self.text}
        if self.data:
            payload["daten"] = self.data
        if self.confirmation_token:
            payload["wartet_auf_bestaetigung"] = True
        return json.dumps(payload, ensure_ascii=False, default=str)[:6000]

    @classmethod
    def success(cls, text: str, **data: Any) -> "ToolResult":
        return cls(ok=True, text=text, data=data)

    @classmethod
    def failure(cls, text: str, **data: Any) -> "ToolResult":
        return cls(ok=False, text=text, data=data)


ToolHandler = Callable[..., Awaitable[ToolResult] | ToolResult]


@dataclass(slots=True)
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: ToolHandler
    action: str = ""          # Name fuer die Berechtigungspruefung
    category: str = "allgemein"
    timeout: float = DEFAULT_TIMEOUT
    #: Werkzeuge, die das Modell nicht sehen soll (nur Knoepfe/Dashboard).
    internal: bool = False

    def spec(self) -> ToolSpec:
        return ToolSpec(self.name, self.description, self.parameters)

    def short(self) -> str:
        return f"{self.name}: {self.description.splitlines()[0]}"


class Toolkit:
    def __init__(self, database: Database) -> None:
        self.db = database
        self._tools: dict[str, Tool] = {}

    # --- Registrierung ----------------------------------------------------
    def register(
        self, name: str, description: str, parameters: dict[str, Any], handler: ToolHandler,
        *, action: str = "", category: str = "allgemein", timeout: float = DEFAULT_TIMEOUT,
        internal: bool = False,
    ) -> Tool:
        if name in self._tools:
            raise ValueError(f"Werkzeug '{name}' ist schon registriert.")
        tool = Tool(
            name=name, description=description, parameters=parameters, handler=handler,
            action=action or name, category=category, timeout=timeout, internal=internal,
        )
        self._tools[name] = tool
        return tool

    def tool(
        self, name: str, description: str, parameters: dict[str, Any] | None = None, **kwargs: Any
    ):
        """Dekorator-Variante von ``register``."""
        def decorator(handler: ToolHandler) -> ToolHandler:
            self.register(name, description, parameters or _empty_schema(), handler, **kwargs)
            return handler
        return decorator

    def unregister(self, name: str) -> None:
        self._tools.pop(name, None)

    # --- Abfragen ---------------------------------------------------------
    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return sorted(self._tools)

    def specs(self, *, include_internal: bool = False) -> list[ToolSpec]:
        return [
            tool.spec() for tool in self._tools.values()
            if include_internal or not tool.internal
        ]

    def descriptions(self, *, include_internal: bool = False) -> list[str]:
        return [
            tool.short() for tool in sorted(self._tools.values(), key=lambda t: t.name)
            if include_internal or not tool.internal
        ]

    def by_category(self) -> dict[str, list[Tool]]:
        grouped: dict[str, list[Tool]] = {}
        for tool in sorted(self._tools.values(), key=lambda t: t.name):
            grouped.setdefault(tool.category, []).append(tool)
        return grouped

    # --- Ausfuehrung ------------------------------------------------------
    async def execute(
        self, name: str, arguments: dict[str, Any] | None = None, *,
        chat_id: str = "", channel: str = "telegram",
    ) -> ToolResult:
        arguments = dict(arguments or {})
        tool = self._tools.get(name)
        if tool is None:
            close = [n for n in self._tools if name.lower() in n.lower()]
            hint = f" Gemeint war vielleicht: {', '.join(close[:3])}." if close else ""
            return ToolResult.failure(f"Das Werkzeug '{name}' gibt es nicht.{hint}")

        prepared = self._coerce(tool, arguments)
        started = time.monotonic()
        try:
            result = await self._invoke(tool, prepared, chat_id=chat_id, channel=channel)
        except PermissionDenied as exc:
            result = ToolResult.failure(exc.user_text())
        except JarvisError as exc:
            log.warning("Werkzeug %s: %s", name, exc)
            result = ToolResult.failure(exc.user_text())
        except (asyncio.TimeoutError, TimeoutError):
            log.error("Werkzeug %s hat die Zeitgrenze von %ss ueberschritten", name, tool.timeout)
            result = ToolResult.failure(
                f"'{name}' hat zu lange gebraucht (ueber {int(tool.timeout)} s) und wurde abgebrochen."
            )
        except TypeError as exc:
            log.warning("Werkzeug %s falsch aufgerufen: %s", name, exc)
            result = ToolResult.failure(f"'{name}' wurde mit unpassenden Angaben aufgerufen: {exc}")
        except Exception as exc:  # pragma: no cover - unerwartet
            log.exception("Werkzeug %s abgestuerzt", name)
            result = ToolResult.failure(f"'{name}' ist auf einen Fehler gelaufen: {type(exc).__name__}: {exc}")

        duration_ms = int((time.monotonic() - started) * 1000)
        self._log_call(tool, prepared, result, duration_ms, chat_id)
        return result

    async def _invoke(
        self, tool: Tool, arguments: dict[str, Any], *, chat_id: str, channel: str
    ) -> ToolResult:
        signature = inspect.signature(tool.handler)
        if "chat_id" in signature.parameters:
            arguments["chat_id"] = chat_id
        if "channel" in signature.parameters:
            arguments["channel"] = channel
        outcome = tool.handler(**arguments)
        if inspect.isawaitable(outcome):
            return await asyncio.wait_for(outcome, timeout=tool.timeout)
        return outcome  # type: ignore[return-value]

    @staticmethod
    def _coerce(tool: Tool, arguments: dict[str, Any]) -> dict[str, Any]:
        """Argumente an das Schema annaehern.

        Sprachmodelle liefern Zahlen als Text, ``"true"`` als Zeichenkette und
        gelegentlich unbekannte Felder. Das soll keinen Aufruf kosten.
        """
        schema = tool.parameters.get("properties") or {}
        allowed = set(schema)
        cleaned: dict[str, Any] = {}
        for key, value in arguments.items():
            if allowed and key not in allowed:
                continue
            expected = (schema.get(key) or {}).get("type")
            if expected == "integer" and isinstance(value, str) and value.strip().lstrip("-").isdigit():
                value = int(value.strip())
            elif expected == "number" and isinstance(value, str):
                try:
                    value = float(value.strip().replace(",", "."))
                except ValueError:
                    pass
            elif expected == "boolean" and isinstance(value, str):
                value = value.strip().lower() in {"true", "1", "ja", "yes", "an"}
            elif expected == "array" and isinstance(value, str):
                value = [part.strip() for part in value.split(",") if part.strip()]
            elif expected == "string" and isinstance(value, (int, float, bool)):
                value = str(value)
            cleaned[key] = value
        return cleaned

    def _log_call(
        self, tool: Tool, arguments: dict[str, Any], result: ToolResult,
        duration_ms: int, chat_id: str,
    ) -> None:
        try:
            self.db.insert("tool_call", {
                "name": tool.name,
                "arguments": json.dumps(arguments, ensure_ascii=False, default=str)[:4000],
                "result": result.text[:2000], "ok": 1 if result.ok else 0,
                "duration_ms": duration_ms, "chat_id": str(chat_id),
                "created_at": iso(utcnow()),
            })
        except Exception:  # pragma: no cover - Protokoll darf nie stoeren
            log.debug("Werkzeugprotokoll konnte nicht geschrieben werden", exc_info=True)

    def recent_calls(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.db.query(
            "SELECT name, arguments, result, ok, duration_ms, created_at FROM tool_call "
            "ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        return [dict(r) for r in rows]


def _empty_schema() -> dict[str, Any]:
    return {"type": "object", "properties": {}, "required": []}


def schema(**properties: dict[str, Any]) -> dict[str, Any]:
    """Kurzschreibweise fuer ein JSON-Schema-Objekt.

    ``required`` ergibt sich aus Feldern, die kein ``default`` mitbringen und
    ausdruecklich ``"pflicht": True`` tragen.
    """
    required = [name for name, spec in properties.items() if spec.pop("pflicht", False)]
    return {"type": "object", "properties": properties, "required": required}


def text_field(description: str, *, pflicht: bool = False, enum: list[str] | None = None) -> dict[str, Any]:
    field_spec: dict[str, Any] = {"type": "string", "description": description}
    if enum:
        field_spec["enum"] = enum
    if pflicht:
        field_spec["pflicht"] = True
    return field_spec


def int_field(description: str, *, pflicht: bool = False) -> dict[str, Any]:
    field_spec: dict[str, Any] = {"type": "integer", "description": description}
    if pflicht:
        field_spec["pflicht"] = True
    return field_spec


def bool_field(description: str) -> dict[str, Any]:
    return {"type": "boolean", "description": description}
