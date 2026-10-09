"""Tests der Modellanbindung gegen einen echten kleinen HTTP-Dienst."""

import threading

import pytest

from jarvis.config import LLMConfig
from jarvis.llm.client import (
    LLMCancelled, LLMError, LLMTimeout, LLMUnavailable, NullLLM, OllamaClient,
)
from tests.fake_ollama import FakeOllama


def client(server: FakeOllama, **kw) -> OllamaClient:
    cfg = LLMConfig(base_url=server.base_url, **kw)
    return OllamaClient(cfg)


def test_strom_wird_zusammengesetzt():
    with FakeOllama() as server:
        antwort = client(server).complete([{"role": "user", "content": "Moin"}])
    assert antwort.text == "Moin Noah."
    assert antwort.duration >= 0


def test_stueckweise_ausgabe():
    """Fuer die Sprachausgabe muss die Antwort vor dem Ende nutzbar sein."""
    with FakeOllama() as server:
        texte = [c.text for c in client(server).chat([{"role": "user", "content": "x"}])
                 if c.text]
    assert texte == ["Moin", " Noah."]


def test_werkzeugaufruf_als_objekt():
    chunks = [{"message": {"content": "", "tool_calls": [
        {"function": {"name": "datei_lesen", "arguments": {"pfad": "~/a.txt"}}}]},
        "done": True}]
    with FakeOllama(chunks=chunks) as server:
        antwort = client(server).complete([{"role": "user", "content": "lies"}])
    assert antwort.wants_tool
    assert antwort.tool_calls[0].name == "datei_lesen"
    assert antwort.tool_calls[0].arguments == {"pfad": "~/a.txt"}


def test_werkzeugaufruf_als_json_string():
    """Manche Modelle liefern die Argumente als String -- beides muss gehen."""
    chunks = [{"message": {"content": "", "tool_calls": [
        {"function": {"name": "t", "arguments": '{"a": 1}'}}]}, "done": True}]
    with FakeOllama(chunks=chunks) as server:
        antwort = client(server).complete([{"role": "user", "content": "x"}])
    assert antwort.tool_calls[0].arguments == {"a": 1}


def test_unlesbare_argumente_beenden_das_gespraech_nicht():
    chunks = [{"message": {"content": "Text dazu", "tool_calls": [
        {"function": {"name": "t", "arguments": "{kaputt"}}]}, "done": True}]
    with FakeOllama(chunks=chunks) as server:
        antwort = client(server).complete([{"role": "user", "content": "x"}])
    assert antwort.text == "Text dazu"
    assert antwort.tool_calls == []


def test_abbruch_beendet_den_strom():
    """Unterbricht der Nutzer, darf keine veraltete Antwort fertiglaufen."""
    chunks = [{"message": {"content": f"Teil {i}"}, "done": i == 9}
              for i in range(10)]
    cancel = threading.Event()
    with FakeOllama(chunks=chunks, delay=0.02) as server:
        strom = client(server).chat([{"role": "user", "content": "x"}], cancel=cancel)
        gelesen = []
        with pytest.raises(LLMCancelled):
            for chunk in strom:
                gelesen.append(chunk.text)
                if len(gelesen) == 2:
                    cancel.set()
        # Abgebrochen, lange bevor alle zehn Stuecke durch waren.
        assert len(gelesen) < 10


def test_abbruch_vor_dem_senden():
    cancel = threading.Event()
    cancel.set()
    with FakeOllama() as server:
        with pytest.raises(LLMCancelled, match="Vor dem Senden"):
            list(client(server).chat([{"role": "user", "content": "x"}], cancel=cancel))
    assert server.requests == []


def test_fehlendes_modell_nennt_den_pull_befehl():
    with FakeOllama(status=404) as server:
        with pytest.raises(LLMUnavailable, match="ollama pull"):
            client(server).complete([{"role": "user", "content": "x"}])


def test_serverfehler_wird_gemeldet():
    with FakeOllama(status=500) as server:
        with pytest.raises(LLMError):
            client(server).complete([{"role": "user", "content": "x"}])


def test_fehlerfeld_im_strom():
    with FakeOllama(chunks=[{"error": "out of memory"}]) as server:
        with pytest.raises(LLMError, match="out of memory"):
            client(server).complete([{"role": "user", "content": "x"}])


def test_nicht_erreichbar_nennt_ollama_serve():
    cfg = LLMConfig(base_url="http://127.0.0.1:1")  # dort hoert nichts
    with pytest.raises(LLMUnavailable, match="ollama serve"):
        OllamaClient(cfg).complete([{"role": "user", "content": "x"}])


def test_zeitueberschreitung_nach_wiederholung():
    with FakeOllama(hang=True) as server:
        c = client(server, timeout_seconds=0.4)
        with pytest.raises(LLMTimeout, match="Versuchen"):
            list(c.chat([{"role": "user", "content": "x"}], retries=1))
    # Zwei Versuche sind wirklich beim Server angekommen.
    assert len(server.requests) == 2


def test_health_meldet_bereit():
    with FakeOllama(models=["qwen2.5:7b-instruct"]) as server:
        ok, text = client(server).health()
    assert ok and "bereit" in text


def test_health_erkennt_latest_suffix():
    """Ollama haengt ':latest' an -- das darf nicht als fehlend gelten."""
    with FakeOllama(models=["qwen2.5:latest"]) as server:
        ok, _ = client(server, model="qwen2.5").health()
    assert ok


def test_health_meldet_fehlendes_modell():
    with FakeOllama(models=["llama3"]) as server:
        ok, text = client(server).health()
    assert not ok and "llama3" in text


def test_health_wirft_nicht_wenn_nichts_laeuft():
    ok, text = OllamaClient(LLMConfig(base_url="http://127.0.0.1:1")).health()
    assert not ok and "nicht erreichbar" in text


def test_werkzeuge_werden_mitgeschickt():
    with FakeOllama() as server:
        werkzeuge = [{"name": "datei_lesen"}]
        client(server).complete([{"role": "user", "content": "x"}], tools=werkzeuge)
    assert server.requests[0]["tools"] == werkzeuge
    assert server.requests[0]["stream"] is True


def test_optionen_werden_uebernommen():
    with FakeOllama() as server:
        client(server, temperature=0.1, context_tokens=4096).complete(
            [{"role": "user", "content": "x"}])
    optionen = server.requests[0]["options"]
    assert optionen["temperature"] == 0.1
    assert optionen["num_ctx"] == 4096


def test_nullmodell_bleibt_ehrlich():
    """Ohne Modell wird nicht geantwortet, sondern gesagt, dass keins da ist."""
    antwort = NullLLM().complete([{"role": "user", "content": "Wie spaet ist es?"}])
    assert "kein Sprachmodell" in antwort.text
    assert NullLLM().health()[0] is False
