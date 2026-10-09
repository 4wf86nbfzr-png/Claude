"""Lokales Sprachmodell ueber Ollama.

Der Standardweg: alles bleibt auf dem Rechner. Ollama kann Werkzeuge
nativ (``/api/chat`` mit ``tools``); Modelle ohne diese Faehigkeit
beantworten die Anfrage mit Text, und ``parse_text_tool_calls`` fischt
den JSON-Block heraus.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..errors import ModelUnavailable
from .provider import (
    AIProvider, ChatMessage, ModelReply, ToolInvocation, ToolSpec,
    ensure_tool_arguments, parse_text_tool_calls,
)

log = logging.getLogger(__name__)


class OllamaProvider(AIProvider):
    name = "ollama"
    supports_native_tools = True

    def __init__(self, model: str, base_url: str = "http://localhost:11434",
                 timeout: float = 120.0) -> None:
        super().__init__(model)
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            # Lokaler Dienst: kein Proxy, keine Umgebungsvariablen.
            self._client = httpx.AsyncClient(timeout=self.timeout, trust_env=False)
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
            "messages": self._convert(messages),
            "stream": False,
            "options": {"temperature": temperature},
        }
        if max_tokens:
            payload["options"]["num_predict"] = max_tokens
        if tools:
            payload["tools"] = [t.as_openai() for t in tools]

        try:
            response = await self._http().post(f"{self.base_url}/api/chat", json=payload)
        except httpx.HTTPError as exc:
            raise ModelUnavailable(
                f"Ollama unter {self.base_url} antwortet nicht.",
                hint="Laeuft 'ollama serve'? Modell vorhanden ('ollama list')?",
            ) from exc

        if response.status_code == 404:
            raise ModelUnavailable(
                f"Ollama kennt das Modell '{self.model}' nicht.",
                hint=f"Einmalig 'ollama pull {self.model}' ausfuehren.",
            )
        if response.status_code >= 400:
            detail = response.text[:300]
            # Manche Modelle lehnen 'tools' ab -- dann ohne Werkzeuge erneut fragen.
            if tools and ("tool" in detail.lower() or response.status_code == 400):
                log.info("Modell %s unterstuetzt keine nativen Werkzeuge -- Textweg", self.model)
                return await self._chat_without_tools(messages, temperature, max_tokens)
            raise ModelUnavailable(f"Ollama meldet einen Fehler ({response.status_code}): {detail}")

        data = response.json()
        message = data.get("message") or {}
        text = (message.get("content") or "").strip()
        calls: list[ToolInvocation] = []
        for index, raw in enumerate(message.get("tool_calls") or []):
            function = raw.get("function") or {}
            name = function.get("name")
            if name:
                calls.append(ToolInvocation(
                    name=name,
                    arguments=ensure_tool_arguments(function.get("arguments")),
                    call_id=raw.get("id") or f"ollama_{index}",
                ))
        if not calls:
            text, calls = parse_text_tool_calls(text)
        return ModelReply(
            text=text, tool_calls=calls, model=self.model, provider=self.name,
            finish_reason=data.get("done_reason", ""),
        )

    async def _chat_without_tools(
        self, messages: list[ChatMessage], temperature: float, max_tokens: int | None
    ) -> ModelReply:
        payload: dict[str, Any] = {
            "model": self.model, "messages": self._convert(messages),
            "stream": False, "options": {"temperature": temperature},
        }
        if max_tokens:
            payload["options"]["num_predict"] = max_tokens
        response = await self._http().post(f"{self.base_url}/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
        text = ((data.get("message") or {}).get("content") or "").strip()
        text, calls = parse_text_tool_calls(text)
        return ModelReply(text=text, tool_calls=calls, model=self.model, provider=self.name)

    @staticmethod
    def _convert(messages: list[ChatMessage]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for message in messages:
            if message.role == "tool":
                out.append({
                    "role": "tool",
                    "content": message.content,
                    "name": message.tool_name or "werkzeug",
                })
                continue
            entry: dict[str, Any] = {"role": message.role, "content": message.content}
            if message.tool_calls:
                entry["tool_calls"] = [
                    {"function": {"name": c.name, "arguments": c.arguments}}
                    for c in message.tool_calls
                ]
            out.append(entry)
        return out

    async def health(self) -> tuple[bool, str]:
        try:
            response = await self._http().get(f"{self.base_url}/api/tags", timeout=8.0)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            return False, f"Ollama nicht erreichbar ({self.base_url}): {type(exc).__name__}"
        names = [m.get("name", "") for m in response.json().get("models", [])]
        if not names:
            return False, "Ollama laeuft, hat aber kein Modell geladen ('ollama pull ...')."
        base = self.model.split(":")[0]
        if self.model in names or any(n.split(":")[0] == base for n in names):
            return True, f"Ollama erreichbar, Modell {self.model} vorhanden"
        return False, (
            f"Ollama laeuft, aber '{self.model}' fehlt. Vorhanden: {', '.join(names[:5])}"
        )

    async def list_models(self) -> list[str]:
        try:
            response = await self._http().get(f"{self.base_url}/api/tags", timeout=8.0)
            response.raise_for_status()
        except httpx.HTTPError:
            return []
        return [m.get("name", "") for m in response.json().get("models", [])]

    async def pull(self, model: str) -> bool:
        """Modell nachladen. Blockiert, bis Ollama fertig ist."""
        try:
            response = await self._http().post(
                f"{self.base_url}/api/pull", json={"name": model, "stream": False}, timeout=1800.0
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            log.error("Modell %s konnte nicht geladen werden: %s", model, exc)
            return False
        return True
