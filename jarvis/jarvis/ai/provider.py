"""Gemeinsame Schnittstelle fuer Sprachmodelle.

Jeder Anbieter bekommt dieselbe Nachrichtenliste und dieselben
Werkzeugbeschreibungen und liefert eine ``ModelReply``. Ob das Modell
Werkzeuge nativ unterstuetzt (Ollama, OpenAI, Anthropic) oder nur Text
liefert, spielt fuer die uebrigen Schichten keine Rolle: ein Modell ohne
native Werkzeuge darf einen JSON-Block schreiben, der hier erkannt wird.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger(__name__)


@dataclass(slots=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]

    def as_openai(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def as_anthropic(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters,
        }


@dataclass(slots=True)
class ChatMessage:
    role: str                      # system | user | assistant | tool
    content: str
    tool_name: str | None = None
    tool_call_id: str | None = None
    tool_calls: list["ToolInvocation"] = field(default_factory=list)


@dataclass(slots=True)
class ToolInvocation:
    name: str
    arguments: dict[str, Any]
    call_id: str = ""


@dataclass(slots=True)
class ModelReply:
    text: str
    tool_calls: list[ToolInvocation] = field(default_factory=list)
    model: str = ""
    provider: str = ""
    finish_reason: str = ""

    @property
    def wants_tools(self) -> bool:
        return bool(self.tool_calls)


class AIProvider:
    """Basis. Unterklassen implementieren ``chat`` und ``health``."""

    name = "basis"
    supports_native_tools = False

    def __init__(self, model: str) -> None:
        self.model = model

    async def chat(
        self, messages: list[ChatMessage], *, tools: list[ToolSpec] | None = None,
        temperature: float = 0.6, max_tokens: int | None = None,
    ) -> ModelReply:
        raise NotImplementedError

    async def health(self) -> tuple[bool, str]:
        """(erreichbar, Beschreibung) -- fuer ``jarvis doctor`` und /system."""
        raise NotImplementedError

    async def close(self) -> None:
        return None


# --- Werkzeugaufrufe aus freiem Text ------------------------------------
_FENCE = re.compile(r"```(?:json|tool|werkzeug)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)
_NAME_KEYS = ("werkzeug", "tool", "name", "function", "aktion")
_ARG_KEYS = ("argumente", "arguments", "parameter", "parameters", "args", "input", "eingabe")


def _iter_json_objects(text: str):
    """Findet balancierte JSON-Objekte im Text (auch ohne Code-Zaun)."""
    depth = 0
    start = -1
    in_string = False
    escape = False
    for index, char in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                yield text[start:index + 1]
                start = -1
            elif depth < 0:
                depth = 0


def parse_text_tool_calls(text: str) -> tuple[str, list[ToolInvocation]]:
    """Trennt Werkzeugaufrufe von der Antwort, wenn das Modell sie als JSON schreibt.

    Erkannt werden ``{"werkzeug": "...", "argumente": {...}}`` und die
    englischen Varianten, mit und ohne Code-Zaun.
    """
    if not text or "{" not in text:
        return text, []

    calls: list[ToolInvocation] = []
    leftovers = text

    candidates: list[str] = [m.group(1) for m in _FENCE.finditer(text)]
    if not candidates:
        candidates = list(_iter_json_objects(text))

    for blob in candidates:
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        name = next((data[k] for k in _NAME_KEYS if isinstance(data.get(k), str)), None)
        if not name:
            continue
        arguments = next(
            (data[k] for k in _ARG_KEYS if isinstance(data.get(k), dict)), None
        )
        if arguments is None:
            arguments = {
                k: v for k, v in data.items()
                if k not in _NAME_KEYS and k not in _ARG_KEYS
            }
        calls.append(ToolInvocation(name=name.strip(), arguments=arguments))
        leftovers = leftovers.replace(blob, " ")

    if not calls:
        return text, []

    # Code-Zaeune, die nur noch das entfernte JSON enthielten, aufraeumen.
    leftovers = re.sub(r"```(?:json|tool|werkzeug)?\s*```", " ", leftovers)
    return leftovers.strip(), calls


def ensure_tool_arguments(arguments: Any) -> dict[str, Any]:
    """Argumente duerfen als Objekt oder als JSON-Zeichenkette kommen."""
    if isinstance(arguments, dict):
        return arguments
    if isinstance(arguments, str) and arguments.strip():
        try:
            parsed = json.loads(arguments)
            return parsed if isinstance(parsed, dict) else {"wert": parsed}
        except json.JSONDecodeError:
            return {"text": arguments}
    return {}


def messages_to_openai(messages: list[ChatMessage]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for message in messages:
        if message.role == "tool":
            out.append({
                "role": "tool",
                "content": message.content,
                "tool_call_id": message.tool_call_id or message.tool_name or "aufruf",
            })
            continue
        entry: dict[str, Any] = {"role": message.role, "content": message.content}
        if message.tool_calls:
            entry["tool_calls"] = [
                {
                    "id": call.call_id or f"aufruf_{index}",
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": json.dumps(call.arguments, ensure_ascii=False),
                    },
                }
                for index, call in enumerate(message.tool_calls)
            ]
            entry["content"] = message.content or ""
        out.append(entry)
    return out
