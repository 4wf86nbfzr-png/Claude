"""Die KI-Anbieter gegen echte Server: Anfrageaufbau, Werkzeuge, Fehlerwege.

Geprueft wird der Code, der im Betrieb mit Ollama, OpenAI oder Anthropic
spricht -- nicht das Ersatzmodell. Dazu gehoert auch, was Jarvis *sendet*:
ein falsch gebautes Werkzeugschema faellt sonst erst beim echten Modell auf.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from jarvis.ai.cloud import AnthropicProvider, OpenAICompatProvider
from jarvis.ai.manager import ModelManager
from jarvis.ai.ollama import OllamaProvider
from jarvis.ai.provider import ChatMessage, ToolInvocation, ToolSpec
from jarvis.config import Settings
from jarvis.errors import CredentialsMissing, ModelUnavailable
from tests.stub_ai import AiStub

_schleife: asyncio.AbstractEventLoop | None = None


@pytest.fixture(autouse=True)
def schleife():
    global _schleife
    _schleife = asyncio.new_event_loop()
    asyncio.set_event_loop(_schleife)
    yield _schleife
    _schleife.close()
    _schleife = None


def run(coroutine):
    assert _schleife is not None
    return _schleife.run_until_complete(coroutine)


@pytest.fixture
def stub():
    server = AiStub(port=8871)
    server.start()
    yield server
    server.stop()


WERKZEUG = ToolSpec(
    name="aufgabe_anlegen",
    description="Legt eine Aufgabe an.",
    parameters={"type": "object", "properties": {
        "titel": {"type": "string", "description": "Worum es geht"}},
        "required": ["titel"]},
)

VERLAUF = [
    ChatMessage(role="system", content="Du bist Jarvis."),
    ChatMessage(role="user", content="Leg mir das an."),
]


# --- Ollama -------------------------------------------------------------------
def test_ollama_anfrage_ist_richtig_gebaut(stub):
    anbieter = OllamaProvider("llama3.1:8b", stub.base_url, timeout=10)
    stub.queue(stub.ollama_text("Mache ich."))
    try:
        antwort = run(anbieter.chat(VERLAUF, tools=[WERKZEUG], temperature=0.3))
    finally:
        run(anbieter.close())

    assert antwort.text == "Mache ich."
    assert antwort.provider == "ollama" and antwort.model == "llama3.1:8b"

    pfad, nutzlast, _ = stub.requests[0]
    assert pfad == "/api/chat"
    assert nutzlast["model"] == "llama3.1:8b"
    assert nutzlast["stream"] is False
    assert nutzlast["options"]["temperature"] == 0.3
    assert [m["role"] for m in nutzlast["messages"]] == ["system", "user"]
    # Das Werkzeugschema darf keine internen Felder enthalten.
    werkzeug = nutzlast["tools"][0]
    assert werkzeug["type"] == "function"
    assert werkzeug["function"]["name"] == "aufgabe_anlegen"
    assert "pflicht" not in json.dumps(werkzeug)


def test_ollama_werkzeugaufruf_wird_erkannt(stub):
    anbieter = OllamaProvider("llama3.1:8b", stub.base_url, timeout=10)
    stub.queue(stub.ollama_tool("aufgabe_anlegen", {"titel": "Dach reparieren"}))
    try:
        antwort = run(anbieter.chat(VERLAUF, tools=[WERKZEUG]))
    finally:
        run(anbieter.close())

    assert antwort.wants_tools
    assert antwort.tool_calls[0].name == "aufgabe_anlegen"
    assert antwort.tool_calls[0].arguments == {"titel": "Dach reparieren"}


def test_ollama_werkzeugergebnis_geht_zurueck(stub):
    """Die zweite Runde muss das Ergebnis im richtigen Format enthalten."""
    anbieter = OllamaProvider("llama3.1:8b", stub.base_url, timeout=10)
    verlauf = [
        *VERLAUF,
        ChatMessage(role="assistant", content="", tool_calls=[
            ToolInvocation(name="aufgabe_anlegen", arguments={"titel": "X"}, call_id="a1")]),
        ChatMessage(role="tool", content='{"erfolg": true}', tool_name="aufgabe_anlegen",
                    tool_call_id="a1"),
    ]
    stub.queue(stub.ollama_text("Ist notiert."))
    try:
        run(anbieter.chat(verlauf, tools=[WERKZEUG]))
    finally:
        run(anbieter.close())

    nachrichten = stub.last_request["messages"]
    assert nachrichten[-1]["role"] == "tool"
    assert nachrichten[-1]["name"] == "aufgabe_anlegen"
    assert nachrichten[-2]["tool_calls"][0]["function"]["name"] == "aufgabe_anlegen"


def test_ollama_modell_ohne_werkzeuge_faellt_auf_text_zurueck(stub):
    """Lehnt das Modell 'tools' ab, wird ohne Werkzeuge erneut gefragt."""
    anbieter = OllamaProvider("llama3.1:8b", stub.base_url, timeout=10)
    stub.reject_tools = True
    stub.queue(stub.ollama_text(
        'Klar.\n```json\n{"werkzeug": "aufgabe_anlegen", '
        '"argumente": {"titel": "Aus Text"}}\n```'
    ))
    try:
        antwort = run(anbieter.chat(VERLAUF, tools=[WERKZEUG]))
    finally:
        run(anbieter.close())

    # Zwei Anfragen: erst mit Werkzeugen (abgelehnt), dann ohne.
    assert len(stub.requests) == 2
    assert "tools" in stub.requests[0][1] and "tools" not in stub.requests[1][1]
    assert antwort.tool_calls[0].arguments == {"titel": "Aus Text"}
    assert antwort.text == "Klar."


def test_ollama_unbekanntes_modell_nennt_den_pull_befehl(stub):
    anbieter = OllamaProvider("gibtsnicht:70b", stub.base_url, timeout=10)
    stub.fail_with = 404
    try:
        with pytest.raises(ModelUnavailable) as fehler:
            run(anbieter.chat(VERLAUF))
    finally:
        run(anbieter.close())
    assert "ollama pull gibtsnicht:70b" in fehler.value.user_text()


def test_ollama_nicht_erreichbar_nennt_serve(stub):
    anbieter = OllamaProvider("llama3.1:8b", "http://127.0.0.1:8899", timeout=2)
    try:
        with pytest.raises(ModelUnavailable) as fehler:
            run(anbieter.chat(VERLAUF))
    finally:
        run(anbieter.close())
    assert "ollama serve" in fehler.value.user_text()


def test_ollama_zustand_und_modellliste(stub):
    anbieter = OllamaProvider("llama3.1:8b", stub.base_url, timeout=10)
    try:
        ok, hinweis = run(anbieter.health())
        assert ok and "llama3.1:8b" in hinweis
        assert "qwen2.5:7b" in run(anbieter.list_models())

        fehlend = OllamaProvider("mistral:7b", stub.base_url, timeout=10)
        ok, hinweis = run(fehlend.health())
        assert not ok and "fehlt" in hinweis
        run(fehlend.close())
    finally:
        run(anbieter.close())


# --- OpenAI-kompatibel --------------------------------------------------------
def test_openai_anfrage_und_werkzeugaufruf(stub):
    anbieter = OpenAICompatProvider("gpt-test", "sk-testschluessel",
                                    f"{stub.base_url}/v1", timeout=10)
    stub.queue(stub.openai_tool("aufgabe_anlegen", {"titel": "Angebot schreiben"}))
    try:
        antwort = run(anbieter.chat(VERLAUF, tools=[WERKZEUG]))
    finally:
        run(anbieter.close())

    assert stub.last_headers.get("Authorization") == "Bearer sk-testschluessel"
    assert stub.last_request["tool_choice"] == "auto"
    # Argumente kommen als JSON-Zeichenkette und muessen ausgepackt werden.
    assert antwort.tool_calls[0].arguments == {"titel": "Angebot schreiben"}
    assert antwort.tool_calls[0].call_id == "call_1"


def test_openai_abgelehnter_schluessel(stub):
    anbieter = OpenAICompatProvider("gpt-test", "sk-falsch", f"{stub.base_url}/v1", timeout=10)
    stub.fail_with = 401
    try:
        with pytest.raises(CredentialsMissing):
            run(anbieter.chat(VERLAUF))
        ok, hinweis = run(anbieter.health())
        assert not ok and "401" in hinweis
    finally:
        run(anbieter.close())


def test_openai_ohne_schluessel_wird_gar_nicht_gebaut():
    with pytest.raises(CredentialsMissing) as fehler:
        OpenAICompatProvider("gpt-test", "")
    assert "OPENAI_API_KEY" in fehler.value.message


# --- Anthropic ----------------------------------------------------------------
def test_anthropic_systemtext_wird_getrennt(stub):
    anbieter = AnthropicProvider("claude-test", "sk-ant-test",
                                 f"{stub.base_url}/v1", timeout=10)
    stub.queue(stub.anthropic_text("Verstanden."))
    try:
        antwort = run(anbieter.chat(VERLAUF, tools=[WERKZEUG], max_tokens=512))
    finally:
        run(anbieter.close())

    nutzlast = stub.last_request
    assert nutzlast["system"] == "Du bist Jarvis."
    assert [m["role"] for m in nutzlast["messages"]] == ["user"]
    assert nutzlast["max_tokens"] == 512
    assert nutzlast["tools"][0]["input_schema"]["required"] == ["titel"]
    assert stub.last_headers.get("x-api-key") == "sk-ant-test"
    assert stub.last_headers.get("anthropic-version") == "2023-06-01"
    assert antwort.text == "Verstanden."


def test_anthropic_werkzeugbloecke(stub):
    anbieter = AnthropicProvider("claude-test", "sk-ant-test",
                                 f"{stub.base_url}/v1", timeout=10)
    stub.queue(stub.anthropic_tool(
        "aufgabe_anlegen", {"titel": "Begehung"}, text="Mache ich."))
    try:
        antwort = run(anbieter.chat(VERLAUF, tools=[WERKZEUG]))
    finally:
        run(anbieter.close())
    assert antwort.text == "Mache ich."
    assert antwort.tool_calls[0].arguments == {"titel": "Begehung"}
    assert antwort.tool_calls[0].call_id == "toolu_1"


def test_anthropic_werkzeugergebnis_wird_als_block_gesendet(stub):
    anbieter = AnthropicProvider("claude-test", "sk-ant-test",
                                 f"{stub.base_url}/v1", timeout=10)
    verlauf = [
        *VERLAUF,
        ChatMessage(role="assistant", content="", tool_calls=[
            ToolInvocation(name="aufgabe_anlegen", arguments={"titel": "X"},
                           call_id="toolu_1")]),
        ChatMessage(role="tool", content='{"erfolg": true}', tool_call_id="toolu_1"),
    ]
    stub.queue(stub.anthropic_text("Fertig."))
    try:
        run(anbieter.chat(verlauf, tools=[WERKZEUG]))
    finally:
        run(anbieter.close())

    nachrichten = stub.last_request["messages"]
    assert nachrichten[-1]["content"][0]["type"] == "tool_result"
    assert nachrichten[-1]["content"][0]["tool_use_id"] == "toolu_1"
    assert nachrichten[-2]["content"][-1]["type"] == "tool_use"


# --- Modellverwaltung ---------------------------------------------------------
def test_wiederholung_bei_voruebergehendem_fehler(stub, monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_URL", stub.base_url)
    monkeypatch.setenv("AI_MAX_RETRIES", "2")
    verwaltung = ModelManager(Settings.load())
    stub.fail_times = 1                      # erster Versuch scheitert
    stub.queue(stub.ollama_text("Beim zweiten Mal."))
    monkeypatch.setattr(asyncio, "sleep", _sofort)

    try:
        antwort = run(verwaltung.chat(VERLAUF))
    finally:
        run(verwaltung.close())

    assert antwort.text == "Beim zweiten Mal."
    assert len(stub.requests) == 2
    assert verwaltung.degraded is False


def test_wechsel_auf_das_ersatzmodell(stub, monkeypatch):
    """Faellt das erste Modell aus, uebernimmt das zweite."""
    zweiter = AiStub(port=8872)
    zweiter.start()
    try:
        monkeypatch.setenv("AI_PROVIDER", "ollama")
        monkeypatch.setenv("OLLAMA_URL", "http://127.0.0.1:8899")   # tot
        monkeypatch.setenv("AI_FALLBACK_PROVIDER", "openai")
        monkeypatch.setenv("AI_FALLBACK_MODEL", "gpt-test")
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("OPENAI_BASE_URL", f"{zweiter.base_url}/v1")
        monkeypatch.setenv("AI_MAX_RETRIES", "0")
        verwaltung = ModelManager(Settings.load())
        zweiter.queue(zweiter.openai_text("Vom Ersatzmodell."))
        monkeypatch.setattr(asyncio, "sleep", _sofort)

        try:
            antwort = run(verwaltung.chat(VERLAUF))
        finally:
            run(verwaltung.close())

        assert antwort.text == "Vom Ersatzmodell."
        assert verwaltung.active.name == "openai"
        assert verwaltung.degraded is False
    finally:
        zweiter.stop()


def test_notbetrieb_wenn_alles_schweigt(monkeypatch):
    """Kein Modell erreichbar: Jarvis antwortet knapp, statt zu verstummen."""
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_URL", "http://127.0.0.1:8899")
    monkeypatch.setenv("AI_MAX_RETRIES", "0")
    verwaltung = ModelManager(Settings.load())
    monkeypatch.setattr(asyncio, "sleep", _sofort)
    try:
        antwort = run(verwaltung.chat(VERLAUF))
    finally:
        run(verwaltung.close())
    assert verwaltung.degraded is True
    assert "/uebersicht" in antwort.text
    assert verwaltung.last_error


def test_modellwechsel_zur_laufzeit(stub, monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_URL", stub.base_url)
    verwaltung = ModelManager(Settings.load())
    try:
        meldung = run(verwaltung.switch("ollama", "qwen2.5:7b"))
        assert "qwen2.5:7b" in meldung
        assert verwaltung.primary.model == "qwen2.5:7b"

        # Ein Wechsel auf ein nicht vorhandenes Modell wird abgelehnt.
        with pytest.raises(ModelUnavailable):
            run(verwaltung.switch("ollama", "gibtsnicht:70b"))
        assert verwaltung.primary.model == "qwen2.5:7b"
    finally:
        run(verwaltung.close())


def test_zustandsbericht_der_verwaltung(stub, monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_URL", stub.base_url)
    verwaltung = ModelManager(Settings.load())
    try:
        bericht = run(verwaltung.health())
        assert bericht["erreichbar"] is True
        assert bericht["anbieter"] == "ollama"
        assert bericht["ersatzbetrieb"] is False
    finally:
        run(verwaltung.close())


async def _sofort(dauer: float) -> None:
    """Wartezeiten zwischen den Versuchen ueberspringen."""
    return None
