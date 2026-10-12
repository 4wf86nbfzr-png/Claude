"""Werkzeugschicht: Registrierung, Argumente, Fehler, Zeitgrenzen."""

import asyncio

import pytest

from jarvis.core.toolkit import ToolResult, Toolkit, int_field, schema, text_field
from jarvis.errors import ToolError


def run(coroutine):
    return asyncio.run(coroutine)


@pytest.fixture
def toolkit(database):
    return Toolkit(database)


def test_registrierung_und_schema(toolkit):
    async def handler(titel: str, anzahl: int = 1) -> ToolResult:
        return ToolResult.success(f"{titel} x{anzahl}")

    toolkit.register(
        "test_werkzeug", "Ein Testwerkzeug",
        schema(titel=text_field("Titel", pflicht=True), anzahl=int_field("Anzahl")),
        handler,
    )
    tool = toolkit.get("test_werkzeug")
    assert tool.parameters["required"] == ["titel"]
    assert "pflicht" not in tool.parameters["properties"]["titel"]
    assert toolkit.specs()[0].name == "test_werkzeug"


def test_argumente_werden_angepasst(toolkit):
    gesehen = {}

    async def handler(anzahl: int = 0, aktiv: bool = False, liste: list | None = None) -> ToolResult:
        gesehen.update({"anzahl": anzahl, "aktiv": aktiv, "liste": liste})
        return ToolResult.success("ok")

    toolkit.register(
        "wandeln", "Wandelt",
        {"type": "object", "properties": {
            "anzahl": {"type": "integer"}, "aktiv": {"type": "boolean"},
            "liste": {"type": "array", "items": {"type": "string"}},
        }},
        handler,
    )
    # So liefern Sprachmodelle ihre Argumente oft: alles als Zeichenkette.
    run(toolkit.execute("wandeln", {"anzahl": "7", "aktiv": "ja", "liste": "a, b"}))
    assert gesehen == {"anzahl": 7, "aktiv": True, "liste": ["a", "b"]}


def test_unbekannte_argumente_werden_verworfen(toolkit):
    async def handler(titel: str = "") -> ToolResult:
        return ToolResult.success(titel)

    toolkit.register("eng", "Eng", schema(titel=text_field("Titel")), handler)
    ergebnis = run(toolkit.execute("eng", {"titel": "gut", "quatsch": "weg"}))
    assert ergebnis.ok and ergebnis.text == "gut"


def test_unbekanntes_werkzeug_mit_hinweis(toolkit):
    async def handler() -> ToolResult:
        return ToolResult.success("ok")

    toolkit.register("aufgaben_liste", "Liste", schema(), handler)
    ergebnis = run(toolkit.execute("aufgaben"))
    assert not ergebnis.ok
    assert "aufgaben_liste" in ergebnis.text


def test_fehler_im_werkzeug_wird_gefangen(toolkit):
    async def handler() -> ToolResult:
        raise RuntimeError("alles kaputt")

    toolkit.register("kaputt", "Kaputt", schema(), handler)
    ergebnis = run(toolkit.execute("kaputt"))
    assert not ergebnis.ok
    assert "alles kaputt" in ergebnis.text


def test_jarvis_fehler_wird_verstaendlich_weitergegeben(toolkit):
    async def handler() -> ToolResult:
        raise ToolError("Das Postfach ist nicht verbunden.", hint="IMAP_HOST setzen.")

    toolkit.register("mail", "Mail", schema(), handler)
    ergebnis = run(toolkit.execute("mail"))
    assert "Postfach" in ergebnis.text and "IMAP_HOST" in ergebnis.text


def test_zeitgrenze_greift(toolkit):
    async def handler() -> ToolResult:
        await asyncio.sleep(5)
        return ToolResult.success("zu spaet")

    toolkit.register("langsam", "Langsam", schema(), handler, timeout=0.1)
    ergebnis = run(toolkit.execute("langsam"))
    assert not ergebnis.ok
    assert "zu lange" in ergebnis.text


def test_aufrufe_werden_protokolliert(toolkit, database):
    async def handler() -> ToolResult:
        return ToolResult.success("fertig")

    toolkit.register("protokoll", "Protokoll", schema(), handler)
    run(toolkit.execute("protokoll", {}, chat_id="42"))
    aufrufe = toolkit.recent_calls()
    assert aufrufe[0]["name"] == "protokoll"
    assert aufrufe[0]["ok"] == 1


def test_ergebnis_fuer_das_modell_ist_json(toolkit):
    ergebnis = ToolResult.success("Aufgabe #1 angelegt", id=1)
    text = ergebnis.for_model()
    assert '"erfolg": true' in text
    assert "Aufgabe #1" in text


def test_alle_echten_werkzeuge_haben_beschreibung_und_schema(services):
    for name in services.toolkit.names():
        tool = services.toolkit.get(name)
        assert tool.description.strip(), name
        assert tool.parameters.get("type") == "object", name
        for feld, spezifikation in tool.parameters.get("properties", {}).items():
            assert "description" in spezifikation, f"{name}.{feld}"
            assert "pflicht" not in spezifikation, f"{name}.{feld}"


# ------------------------------------------------- Vorauswahl fuer kleine Modelle
def test_ohne_grenze_kommen_alle_werkzeuge(services):
    alle = services.toolkit.specs()
    assert services.toolkit.specs_passend("irgendwas", 0) == alle


def test_vorauswahl_haelt_die_grenze_ein(services):
    gewaehlt = services.toolkit.specs_passend("Erinnere mich morgen an Alex", 12)
    assert len(gewaehlt) == 12


def test_vorauswahl_nimmt_das_passende_werkzeug_mit(services):
    namen = [s.name for s in services.toolkit.specs_passend(
        "Was war heute in den Nachrichten?", 12)]
    assert "nachrichtenlage" in namen


def test_vorauswahl_behaelt_die_grundausstattung(services):
    namen = [s.name for s in services.toolkit.specs_passend("blablubb", 8)]
    for grund in ("aufgabe_anlegen", "erinnerung_anlegen", "gedaechtnis_merken"):
        assert grund in namen


def test_bevorzugte_werkzeuge_bleiben_drin(services):
    namen = [s.name for s in services.toolkit.specs_passend(
        "blablubb", 8, bevorzugt=["systemstatus"])]
    assert "systemstatus" in namen


def test_werkzeuggrenze_haengt_am_modell(settings):
    settings.ai_model = "llama3.2:3b"
    assert settings.werkzeuggrenze == 12
    settings.ai_model = "claude-haiku-5-5"
    assert settings.werkzeuggrenze == 0
    settings.ai_max_tools = 5          # ausdrueckliche Einstellung schlaegt alles
    assert settings.werkzeuggrenze == 5


def test_ollama_laesst_das_modell_geladen():
    from jarvis.ai.ollama import OllamaProvider
    anbieter = OllamaProvider("llama3.2:3b", keep_alive="30m", context=2048)
    assert anbieter.keep_alive == "30m" and anbieter.context == 2048
