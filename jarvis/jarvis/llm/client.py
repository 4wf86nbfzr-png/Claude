"""Anbindung des Sprachmodells.

Umgesetzt mit ``urllib`` aus der Standardbibliothek statt mit ``requests`` oder
``httpx``: der Kern soll ohne zusaetzliche Abhaengigkeiten laufen, und fuer
einen lokalen HTTP-Dienst auf 127.0.0.1 reicht das vollkommen.

Drei Dinge sind hier wesentlich:

* **Streaming.** Die Antwort kommt stueckweise, damit die Sprachausgabe
  beginnen kann, bevor der Satz fertig ist.
* **Abbruch.** Jede Anfrage bekommt ein ``threading.Event``. Wird es gesetzt
  (Nutzer unterbricht), bricht der Strom ab, statt eine veraltete Antwort
  fertigzustellen.
* **Ehrliche Fehler.** Kein Modell, keine Verbindung, Zeitueberschreitung --
  jeder Fall hat eine eigene Ausnahme mit einem Satz, der sagt, was zu tun ist.
"""

from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Iterator, Protocol

from ..config import LLMConfig
from ..logging_setup import get_logger

log = get_logger("llm")


class LLMError(RuntimeError):
    """Oberklasse aller Modellfehler."""


class LLMUnavailable(LLMError):
    """Die Laufzeit ist nicht erreichbar oder das Modell fehlt."""


class LLMTimeout(LLMError):
    """Das Modell hat nicht rechtzeitig geantwortet."""


class LLMCancelled(LLMError):
    """Die Anfrage wurde abgebrochen -- in der Regel, weil der Nutzer sprach."""


@dataclass(slots=True)
class ToolCall:
    name: str
    arguments: dict


@dataclass(slots=True)
class Chunk:
    """Ein Stueck der Antwort."""

    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    done: bool = False


@dataclass(slots=True)
class Completion:
    """Die vollstaendige Antwort nach dem Strom."""

    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    duration: float = 0.0
    model: str = ""

    @property
    def wants_tool(self) -> bool:
        return bool(self.tool_calls)


class LLM(Protocol):
    """Schnittstelle, gegen die der Rest von JARVIS programmiert.

    Dadurch laesst sich die Gespraechsverwaltung ohne laufendes Modell testen.
    """

    def chat(self, messages: list[dict], *, tools: list[dict] | None = ...,
             cancel: threading.Event | None = ...) -> Iterator[Chunk]: ...

    def health(self) -> tuple[bool, str]: ...


class OllamaClient:
    """Spricht mit einem lokalen Ollama-Dienst."""

    def __init__(self, config: LLMConfig | None = None, *, opener=None) -> None:
        self.config = config or LLMConfig()
        self.base_url = self.config.base_url.rstrip("/")
        # Eigener Opener ohne Proxy: der Dienst laeuft lokal, ein
        # Umgebungs-Proxy wuerde die Anfrage ins Nirgendwo schicken.
        self._opener = opener or urllib.request.build_opener(
            urllib.request.ProxyHandler({}))

    # -- Gespraech ------------------------------------------------------
    def chat(self, messages: list[dict], *, tools: list[dict] | None = None,
             cancel: threading.Event | None = None,
             retries: int = 1) -> Iterator[Chunk]:
        """Schickt ein Gespraech und gibt die Antwort stueckweise zurueck."""
        payload: dict = {
            "model": self.config.model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": self.config.temperature,
                "num_ctx": self.config.context_tokens,
            },
        }
        if tools:
            payload["tools"] = tools

        letzter_fehler: Exception | None = None
        for versuch in range(retries + 1):
            if cancel is not None and cancel.is_set():
                raise LLMCancelled("Vor dem Senden abgebrochen.")
            try:
                yield from self._stream(payload, cancel)
                return
            except (LLMCancelled, LLMUnavailable):
                raise
            except (LLMTimeout, urllib.error.URLError, OSError) as exc:
                letzter_fehler = exc
                if versuch < retries:
                    wartezeit = 0.5 * (2 ** versuch)
                    log.warning("Modellanfrage fehlgeschlagen (%s), neuer Versuch in %.1fs",
                                exc, wartezeit)
                    time.sleep(wartezeit)
                    continue
                break
        raise LLMTimeout(
            f"Das Modell hat nach {retries + 1} Versuchen nicht geantwortet: "
            f"{letzter_fehler}. Laeuft Ollama? `ollama serve`"
        )

    def _stream(self, payload: dict, cancel: threading.Event | None) -> Iterator[Chunk]:
        request = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            response = self._opener.open(request, timeout=self.config.timeout_seconds)
        except urllib.error.HTTPError as exc:
            koerper = exc.read().decode("utf-8", "replace")[:400]
            if exc.code == 404:
                raise LLMUnavailable(
                    f"Ollama kennt das Modell '{self.config.model}' nicht. "
                    f"Laden mit: ollama pull {self.config.model}"
                ) from exc
            raise LLMError(f"Ollama antwortet mit HTTP {exc.code}: {koerper}") from exc
        except urllib.error.URLError as exc:
            raise LLMUnavailable(
                f"Ollama ist unter {self.base_url} nicht erreichbar ({exc.reason}). "
                "Starten mit: ollama serve"
            ) from exc

        with response:
            for zeile in response:
                if cancel is not None and cancel.is_set():
                    # Verbindung schliessen, damit Ollama die Erzeugung abbricht
                    # und keine Rechenzeit fuer eine verworfene Antwort verbrennt.
                    response.close()
                    raise LLMCancelled("Abgebrochen, weil der Nutzer gesprochen hat.")
                zeile = zeile.strip()
                if not zeile:
                    continue
                try:
                    daten = json.loads(zeile)
                except json.JSONDecodeError:
                    log.debug("Unverstaendliche Zeile vom Modell: %r", zeile[:120])
                    continue
                if fehler := daten.get("error"):
                    raise LLMError(f"Ollama meldet: {fehler}")
                chunk = _parse_chunk(daten)
                if chunk is not None:
                    yield chunk

    # -- Einmalantwort --------------------------------------------------
    def complete(self, messages: list[dict], *, tools: list[dict] | None = None,
                 cancel: threading.Event | None = None) -> Completion:
        """Sammelt den Strom zu einer vollstaendigen Antwort."""
        begin = time.monotonic()
        teile: list[str] = []
        aufrufe: list[ToolCall] = []
        for chunk in self.chat(messages, tools=tools, cancel=cancel):
            teile.append(chunk.text)
            aufrufe.extend(chunk.tool_calls)
        return Completion(
            text="".join(teile).strip(),
            tool_calls=aufrufe,
            duration=time.monotonic() - begin,
            model=self.config.model,
        )

    # -- Zustand --------------------------------------------------------
    def health(self) -> tuple[bool, str]:
        """(erreichbar, Klartext). Wirft nicht -- fuer Diagnose und Dashboard."""
        try:
            request = urllib.request.Request(f"{self.base_url}/api/tags")
            with self._opener.open(request, timeout=3.0) as response:
                daten = json.loads(response.read().decode("utf-8"))
        except urllib.error.URLError as exc:
            return False, f"nicht erreichbar ({exc.reason})"
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)
        namen = [m.get("name", "") for m in daten.get("models", [])]
        stamm = self.config.model.split(":")[0]
        if any(n == self.config.model or n.split(":")[0] == stamm for n in namen):
            return True, f"{self.config.model} bereit"
        return False, (f"'{self.config.model}' nicht geladen "
                       f"(vorhanden: {', '.join(namen) or 'keines'})")

    def models(self) -> list[str]:
        try:
            request = urllib.request.Request(f"{self.base_url}/api/tags")
            with self._opener.open(request, timeout=3.0) as response:
                daten = json.loads(response.read().decode("utf-8"))
            return [m.get("name", "") for m in daten.get("models", [])]
        except Exception:  # noqa: BLE001
            return []


def _parse_chunk(daten: dict) -> Chunk | None:
    """Liest ein Ollama-Antwortstueck.

    Ollama liefert Werkzeugaufrufe als Objekt mit ``function.arguments``, die je
    nach Modell ein Objekt *oder* ein JSON-String sind. Beides wird akzeptiert;
    was sich nicht lesen laesst, wird verworfen statt zu werfen -- ein
    verpfuschter Aufruf soll das Gespraech nicht beenden.
    """
    nachricht = daten.get("message") or {}
    text = nachricht.get("content") or ""
    aufrufe: list[ToolCall] = []
    for roh in nachricht.get("tool_calls") or []:
        funktion = roh.get("function") or {}
        name = funktion.get("name")
        if not name:
            continue
        argumente = funktion.get("arguments", {})
        if isinstance(argumente, str):
            try:
                argumente = json.loads(argumente) if argumente.strip() else {}
            except json.JSONDecodeError:
                log.warning("Werkzeugaufruf '%s' hat unlesbare Argumente: %r",
                            name, argumente[:120])
                continue
        if not isinstance(argumente, dict):
            log.warning("Werkzeugaufruf '%s': Argumente sind kein Objekt (%s)",
                        name, type(argumente).__name__)
            continue
        aufrufe.append(ToolCall(name=name, arguments=argumente))

    fertig = bool(daten.get("done"))
    if not text and not aufrufe and not fertig:
        return None
    return Chunk(text=text, tool_calls=aufrufe, done=fertig)


class NullLLM:
    """Ersatzmodell fuer den Betrieb ohne Sprachmodell.

    Antwortet nicht frei, sondern sagt, dass kein Modell verfuegbar ist. Damit
    bleibt JARVIS bedienbar (Aufgaben, Gedaechtnis, Dashboard), ohne zu
    behaupten, er habe verstanden.
    """

    def chat(self, messages: list[dict], *, tools: list[dict] | None = None,
             cancel: threading.Event | None = None) -> Iterator[Chunk]:
        yield Chunk(
            text="Ich habe gerade kein Sprachmodell zur Verfuegung. "
                 "Aufgaben und Gedaechtnis kann ich trotzdem verwalten.",
            done=True,
        )

    def complete(self, messages: list[dict], **kw) -> Completion:
        teile = [c.text for c in self.chat(messages)]
        return Completion(text="".join(teile), model="none")

    def health(self) -> tuple[bool, str]:
        return False, "kein Sprachmodell konfiguriert (runtime = none)"

    def models(self) -> list[str]:
        return []
