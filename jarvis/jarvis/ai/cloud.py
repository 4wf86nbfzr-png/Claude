"""Externe KI-Dienste als freiwillige Erweiterung.

Nur aktiv, wenn ein Schluessel in der Konfiguration steht. Die Voreinstellung
bleibt das lokale Modell -- hier wird keine kostenpflichtige Abhaengigkeit
erzwungen. Beide Klassen sprechen ihre nativen Werkzeug-Schnittstellen.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..errors import CredentialsMissing, ModelUnavailable
from .provider import (
    AIProvider, ChatMessage, ModelReply, ToolInvocation, ToolSpec,
    ensure_tool_arguments, messages_to_openai, parse_text_tool_calls,
)

log = logging.getLogger(__name__)


class OpenAICompatProvider(AIProvider):
    """Alles, was die OpenAI-Chat-Schnittstelle spricht (auch Groq, LM Studio, vLLM)."""

    name = "openai"
    supports_native_tools = True

    def __init__(self, model: str, api_key: str, base_url: str = "https://api.openai.com/v1",
                 timeout: float = 120.0) -> None:
        super().__init__(model)
        if not api_key:
            raise CredentialsMissing("Fuer den OpenAI-Weg fehlt OPENAI_API_KEY.")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                headers={"Authorization": f"Bearer {self.api_key}",
                         "Content-Type": "application/json"},
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def chat(
        self, messages: list[ChatMessage], *, tools: list[ToolSpec] | None = None,
        temperature: float = 0.6, max_tokens: int | None = None,
    ) -> ModelReply:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages_to_openai(messages),
            "temperature": temperature,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if tools:
            payload["tools"] = [t.as_openai() for t in tools]
            payload["tool_choice"] = "auto"
        try:
            response = await self._http().post(f"{self.base_url}/chat/completions", json=payload)
        except httpx.HTTPError as exc:
            raise ModelUnavailable(f"{self.base_url} nicht erreichbar: {type(exc).__name__}") from exc
        if response.status_code == 401:
            raise CredentialsMissing("Der OpenAI-Schluessel wurde abgelehnt (401).")
        if response.status_code >= 400:
            raise ModelUnavailable(f"Fehler {response.status_code}: {response.text[:300]}")

        choice = (response.json().get("choices") or [{}])[0]
        message = choice.get("message") or {}
        text = (message.get("content") or "").strip()
        calls = [
            ToolInvocation(
                name=(raw.get("function") or {}).get("name", ""),
                arguments=ensure_tool_arguments((raw.get("function") or {}).get("arguments")),
                call_id=raw.get("id") or f"openai_{index}",
            )
            for index, raw in enumerate(message.get("tool_calls") or [])
        ]
        calls = [c for c in calls if c.name]
        if not calls:
            text, calls = parse_text_tool_calls(text)
        return ModelReply(text=text, tool_calls=calls, model=self.model, provider=self.name,
                          finish_reason=choice.get("finish_reason", ""))

    async def health(self) -> tuple[bool, str]:
        try:
            response = await self._http().get(f"{self.base_url}/models", timeout=10.0)
        except httpx.HTTPError as exc:
            return False, f"{self.base_url} nicht erreichbar: {type(exc).__name__}"
        if response.status_code == 401:
            return False, "Schluessel abgelehnt (401)"
        if response.status_code >= 400:
            return False, f"Fehler {response.status_code}"
        return True, f"{self.base_url} erreichbar, Modell {self.model}"


class AnthropicProvider(AIProvider):
    name = "anthropic"
    supports_native_tools = True

    def __init__(self, model: str, api_key: str, base_url: str = "https://api.anthropic.com/v1",
                 timeout: float = 120.0) -> None:
        super().__init__(model)
        if not api_key:
            raise CredentialsMissing("Fuer den Anthropic-Weg fehlt ANTHROPIC_API_KEY.")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01",
                         "Content-Type": "application/json"},
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def chat(
        self, messages: list[ChatMessage], *, tools: list[ToolSpec] | None = None,
        temperature: float = 0.6, max_tokens: int | None = None,
    ) -> ModelReply:
        system_parts = [m.content for m in messages if m.role == "system"]
        converted: list[dict[str, Any]] = []
        for message in messages:
            if message.role == "system":
                continue
            if message.role == "tool":
                converted.append({"role": "user", "content": [{
                    "type": "tool_result",
                    "tool_use_id": message.tool_call_id or message.tool_name or "aufruf",
                    "content": message.content,
                }]})
                continue
            if message.tool_calls:
                blocks: list[dict[str, Any]] = []
                if message.content:
                    blocks.append({"type": "text", "text": message.content})
                for index, call in enumerate(message.tool_calls):
                    blocks.append({
                        "type": "tool_use",
                        "id": call.call_id or f"aufruf_{index}",
                        "name": call.name,
                        "input": call.arguments,
                    })
                converted.append({"role": "assistant", "content": blocks})
                continue
            if message.content:
                converted.append({"role": message.role, "content": message.content})

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": converted,
            "max_tokens": max_tokens or 2048,
            "temperature": temperature,
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)
        if tools:
            payload["tools"] = [t.as_anthropic() for t in tools]

        try:
            response = await self._http().post(f"{self.base_url}/messages", json=payload)
        except httpx.HTTPError as exc:
            raise ModelUnavailable(f"{self.base_url} nicht erreichbar: {type(exc).__name__}") from exc
        if response.status_code == 401:
            raise CredentialsMissing("Der Anthropic-Schluessel wurde abgelehnt (401).")
        if response.status_code >= 400:
            raise ModelUnavailable(f"Fehler {response.status_code}: {response.text[:300]}")

        data = response.json()
        texts: list[str] = []
        calls: list[ToolInvocation] = []
        for block in data.get("content") or []:
            if block.get("type") == "text":
                texts.append(block.get("text", ""))
            elif block.get("type") == "tool_use":
                calls.append(ToolInvocation(
                    name=block.get("name", ""),
                    arguments=ensure_tool_arguments(block.get("input")),
                    call_id=block.get("id", ""),
                ))
        text = "\n".join(t for t in texts if t).strip()
        if not calls:
            text, calls = parse_text_tool_calls(text)
        return ModelReply(text=text, tool_calls=calls, model=self.model, provider=self.name,
                          finish_reason=data.get("stop_reason", ""))

    async def health(self) -> tuple[bool, str]:
        try:
            response = await self._http().post(
                f"{self.base_url}/messages",
                json={"model": self.model, "max_tokens": 1,
                      "messages": [{"role": "user", "content": "ping"}]},
                timeout=15.0,
            )
        except httpx.HTTPError as exc:
            return False, f"{self.base_url} nicht erreichbar: {type(exc).__name__}"
        if response.status_code == 401:
            return False, "Schluessel abgelehnt (401)"
        if response.status_code >= 400:
            return False, f"Fehler {response.status_code}: {response.text[:120]}"
        return True, f"Anthropic erreichbar, Modell {self.model}"


class EchoProvider(AIProvider):
    """Ersatzmodell ohne KI.

    Wird in Tests benutzt und greift auch dann, wenn gar kein Modell
    erreichbar ist: Jarvis bleibt bedienbar (Befehle, Knoepfe, Erinnerungen),
    sagt aber offen, dass das Sprachmodell fehlt.
    """

    name = "echo"
    supports_native_tools = False

    def __init__(self, model: str = "echo", scripted: list[ModelReply] | None = None) -> None:
        super().__init__(model)
        self.scripted = list(scripted or [])
        self.calls: list[list[ChatMessage]] = []

    async def chat(
        self, messages: list[ChatMessage], *, tools: list[ToolSpec] | None = None,
        temperature: float = 0.6, max_tokens: int | None = None,
    ) -> ModelReply:
        self.calls.append(list(messages))
        if self.scripted:
            return self.scripted.pop(0)
        last = next((m.content for m in reversed(messages) if m.role == "user"), "")
        return ModelReply(
            text=(
                "Das Sprachmodell ist gerade nicht erreichbar, deshalb antworte ich knapp. "
                f"Verstanden habe ich: „{last[:200]}“. "
                "Befehle wie /uebersicht, /aufgaben und /erinnerungen funktionieren weiterhin."
            ),
            model=self.model, provider=self.name,
        )

    async def health(self) -> tuple[bool, str]:
        return True, "Ersatzmodell (keine KI) -- antwortet, denkt aber nicht"
