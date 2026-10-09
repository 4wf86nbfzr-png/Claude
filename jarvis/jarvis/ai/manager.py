"""Modellverwaltung.

Haelt den aktiven Anbieter, kennt einen Ersatz und faellt im Notfall auf
das Ersatzmodell zurueck, damit Jarvis nie ganz verstummt. Wiederholungen
nur bei voruebergehenden Fehlern; ein fehlender Schluessel wird nicht
dreimal probiert.
"""

from __future__ import annotations

import asyncio
import logging

from ..config import Settings
from ..errors import CredentialsMissing, ModelUnavailable
from .cloud import AnthropicProvider, EchoProvider, OpenAICompatProvider
from .ollama import OllamaProvider
from .provider import AIProvider, ChatMessage, ModelReply, ToolSpec

log = logging.getLogger(__name__)


def build_provider(kind: str, model: str, settings: Settings) -> AIProvider:
    kind = (kind or "").lower()
    if kind == "ollama":
        return OllamaProvider(model or settings.ai_model, settings.ollama_url, settings.ai_timeout)
    if kind in {"openai", "openai-compat", "groq", "lmstudio", "vllm"}:
        return OpenAICompatProvider(
            model or settings.ai_model, settings.openai_api_key,
            settings.openai_base_url, settings.ai_timeout,
        )
    if kind == "anthropic":
        return AnthropicProvider(
            model or settings.ai_model, settings.anthropic_api_key,
            settings.anthropic_base_url, settings.ai_timeout,
        )
    if kind in {"echo", "none", ""}:
        return EchoProvider(model or "echo")
    raise ModelUnavailable(f"Unbekannter KI-Anbieter '{kind}'.")


class ModelManager:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.primary: AIProvider = build_provider(
            settings.ai_provider, settings.ai_model, settings
        )
        self.fallback: AIProvider | None = None
        if settings.ai_fallback_provider:
            try:
                self.fallback = build_provider(
                    settings.ai_fallback_provider,
                    settings.ai_fallback_model or settings.ai_model, settings,
                )
            except (CredentialsMissing, ModelUnavailable) as exc:
                log.warning("Ersatzmodell nicht verfuegbar: %s", exc)
        self.echo = EchoProvider()
        self.active: AIProvider = self.primary
        self.last_error: str = ""
        self.degraded = False

    # ---------------------------------------------------------------------
    @property
    def description(self) -> str:
        return f"{self.active.name}/{self.active.model}"

    async def chat(
        self, messages: list[ChatMessage], *, tools: list[ToolSpec] | None = None,
        temperature: float | None = None, max_tokens: int | None = None,
    ) -> ModelReply:
        """Fragt das Modell, mit Wiederholung und Rueckfall."""
        temperature = self.settings.ai_temperature if temperature is None else temperature
        order: list[AIProvider] = [self.primary]
        if self.fallback is not None:
            order.append(self.fallback)
        order.append(self.echo)

        last_exception: Exception | None = None
        for provider in order:
            attempts = self.settings.ai_max_retries + 1 if provider is not self.echo else 1
            for attempt in range(1, attempts + 1):
                try:
                    reply = await provider.chat(
                        messages, tools=tools, temperature=temperature, max_tokens=max_tokens
                    )
                except CredentialsMissing as exc:
                    last_exception = exc
                    self.last_error = str(exc)
                    break  # Fehlender Schluessel wird durch Wiederholen nicht besser.
                except (ModelUnavailable, asyncio.TimeoutError, TimeoutError) as exc:
                    last_exception = exc
                    self.last_error = str(exc)
                    if attempt < attempts:
                        wait = min(2 ** attempt, 8)
                        log.warning(
                            "%s antwortet nicht (%s/%s), neuer Versuch in %ss",
                            provider.name, attempt, attempts, wait,
                        )
                        await asyncio.sleep(wait)
                        continue
                    break
                except Exception as exc:  # pragma: no cover - unerwartet
                    last_exception = exc
                    self.last_error = f"{type(exc).__name__}: {exc}"
                    log.exception("Unerwarteter Fehler bei %s", provider.name)
                    break
                else:
                    if provider is not self.active:
                        log.warning("Wechsel auf %s/%s", provider.name, provider.model)
                    self.active = provider
                    self.degraded = provider is self.echo
                    if provider is not self.echo:
                        self.last_error = ""
                    return reply

        self.degraded = True
        if last_exception is not None:
            self.last_error = str(last_exception)
        raise ModelUnavailable(
            "Kein Sprachmodell erreichbar.",
            hint=self.last_error or "Mit 'jarvis doctor' pruefen.",
        )

    async def health(self) -> dict[str, object]:
        ok, detail = await self.primary.health()
        result: dict[str, object] = {
            "anbieter": self.primary.name, "modell": self.primary.model,
            "erreichbar": ok, "hinweis": detail,
            "aktiv": f"{self.active.name}/{self.active.model}",
            "ersatzbetrieb": self.degraded,
            "letzter_fehler": self.last_error,
        }
        if self.fallback is not None:
            fallback_ok, fallback_detail = await self.fallback.health()
            result["ersatz"] = {
                "anbieter": self.fallback.name, "modell": self.fallback.model,
                "erreichbar": fallback_ok, "hinweis": fallback_detail,
            }
        return result

    async def switch(self, provider_kind: str, model: str = "") -> str:
        """Kontrollierter Wechsel zur Laufzeit (ueber /system oder Dashboard)."""
        candidate = build_provider(provider_kind, model or self.settings.ai_model, self.settings)
        ok, detail = await candidate.health()
        if not ok:
            await candidate.close()
            raise ModelUnavailable(f"Wechsel abgebrochen: {detail}")
        old = self.primary
        self.primary = candidate
        self.active = candidate
        self.degraded = False
        self.last_error = ""
        if old is not candidate:
            await old.close()
        return f"Aktives Modell: {candidate.name}/{candidate.model}"

    async def close(self) -> None:
        for provider in {self.primary, self.fallback, self.echo}:
            if provider is not None:
                await provider.close()
