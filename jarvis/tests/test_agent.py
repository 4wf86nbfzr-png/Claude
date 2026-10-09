"""Tests des Agenten.

Schwerpunkt: der Werkzeugkreislauf, die Rueckfrage bei kritischen Aktionen und
die Regel, dass proaktive Meldungen aus dem gespeicherten Aufgabenstatus
kommen -- nicht aus dem Text des Modells.
"""

import threading

import pytest

from jarvis.agent import Agent
from jarvis.config import Config
from jarvis.llm.client import Chunk, LLMCancelled, LLMError, ToolCall
from jarvis.memory.db import Database
from jarvis.notify.manager import NotifyConfig, Priority
from jarvis.permissions import Policy, Scope
from jarvis.tasks.manager import Status
from jarvis.tools.registry import Param, ToolRegistry, ToolResult


class ScriptedLLM:
    """Modell, das eine vorgegebene Folge von Antworten liefert."""

    def __init__(self, antworten: list[list[Chunk]]) -> None:
        self.antworten = antworten
        self.aufrufe: list[list[dict]] = []
        self.werkzeuge_gesehen: list[list[dict] | None] = []

    def chat(self, messages, *, tools=None, cancel=None):
        self.aufrufe.append(messages)
        self.werkzeuge_gesehen.append(tools)
        if cancel is not None and cancel.is_set():
            raise LLMCancelled("abgebrochen")
        if not self.antworten:
            yield Chunk(text="(nichts mehr)", done=True)
            return
        yield from self.antworten.pop(0)


class BrokenLLM:
    def chat(self, messages, *, tools=None, cancel=None):
        raise LLMError("Ollama ist nicht erreichbar")
        yield  # pragma: no cover


def text(s: str) -> list[Chunk]:
    return [Chunk(text=s, done=True)]


def call(name: str, **args) -> list[Chunk]:
    return [Chunk(tool_calls=[ToolCall(name=name, arguments=args)], done=True)]


def make(llm, *, granted=(Scope.READ,), auto_confirm=(), notify=None, tools=True):
    cfg = Config()
    cfg.policy = Policy(granted=frozenset(granted), roots=(),
                        auto_confirm=frozenset(auto_confirm))
    cfg.notify = notify or NotifyConfig(min_gap_seconds=0,
                                        speak_threshold=Priority.NOTABLE,
                                        quiet_hours=(0, 0))
    db = Database()
    reg = ToolRegistry(cfg.policy)
    if tools:
        @reg.register("wetter", "Nennt das Wetter", Scope.READ,
                      {"ort": Param(str, description="Ortsname")})
        def _wetter(ort: str) -> ToolResult:
            return ToolResult(ok=True, value=f"In {ort} regnet es",
                              verification="Messwert abgerufen")

        @reg.register("loeschen", "Loescht eine Datei", Scope.DELETE,
                      {"pfad": Param(str)})
        def _loeschen(pfad: str) -> ToolResult:
            return ToolResult(ok=True, value=f"{pfad} geloescht",
                              verification="Datei existiert nicht mehr")

        @reg.register("kaputt", "Scheitert immer", Scope.READ)
        def _kaputt() -> ToolResult:
            return ToolResult(ok=False, message="Dienst nicht erreichbar")

    agent = Agent(cfg, db, llm, registry=reg)
    return agent, db


# -- Grundgespraech -----------------------------------------------------
def test_einfache_antwort():
    agent, db = make(ScriptedLLM([text("Moin Noah.")]))
    antwort = agent.respond("Moin")
    assert antwort.text == "Moin Noah."
    assert not antwort.needs_confirmation
    db.close()


def test_verlauf_wird_gespeichert():
    agent, db = make(ScriptedLLM([text("Alles klar.")]))
    agent.respond("Merk dir das")
    verlauf = [(t.role, t.content) for t in agent.short_term.recent()]
    assert verlauf == [("user", "Merk dir das"), ("assistant", "Alles klar.")]
    db.close()


def test_leere_eingabe_erzeugt_keine_anfrage():
    llm = ScriptedLLM([text("sollte nicht kommen")])
    agent, db = make(llm)
    assert agent.respond("   ").text == ""
    assert llm.aufrufe == []
    db.close()


def test_systemtext_enthaelt_fakten_und_aufgaben():
    agent, db = make(ScriptedLLM([text("ok")]))
    agent.long_term.remember("Noah", "Buero", "Hamburg")
    agent.tasks.create("Angebot schreiben")
    agent.respond("Was ist offen?")
    system = agent.conversation.system_message()["content"]
    assert "Hamburg" in system
    assert "Angebot schreiben" in system
    db.close()


def test_nur_erlaubte_werkzeuge_werden_angeboten():
    """Was nicht angeboten wird, kann das Modell nicht halluzinieren."""
    llm = ScriptedLLM([text("ok")])
    agent, db = make(llm, granted=(Scope.READ,))
    agent.respond("x")
    namen = {w["name"] for w in llm.werkzeuge_gesehen[0]}
    assert "wetter" in namen
    assert "loeschen" not in namen  # delete nicht erteilt
    db.close()


# -- Werkzeugkreislauf --------------------------------------------------
def test_werkzeug_wird_ausgefuehrt_und_ergebnis_zurueckgegeben():
    llm = ScriptedLLM([call("wetter", ort="Hamburg"), text("In Hamburg regnet es.")])
    agent, db = make(llm)
    antwort = agent.respond("Wie ist das Wetter in Hamburg?")
    assert antwort.text == "In Hamburg regnet es."
    assert len(antwort.tool_runs) == 1
    assert antwort.tool_runs[0].ok
    # Das Ergebnis ist in der zweiten Anfrage als Werkzeugnachricht enthalten.
    zweite = llm.aufrufe[1]
    assert any(m["role"] == "tool" and "regnet" in m["content"] for m in zweite)
    db.close()


def test_gescheitertes_werkzeug_wird_dem_modell_deutlich_gesagt():
    llm = ScriptedLLM([call("kaputt"), text("Das hat nicht geklappt.")])
    agent, db = make(llm)
    antwort = agent.respond("Mach was")
    assert not antwort.tool_runs[0].ok
    werkzeugnachricht = [m for m in llm.aufrufe[1] if m["role"] == "tool"][0]
    assert "NICHT ausgefuehrt" in werkzeugnachricht["content"]
    assert "behaupte nicht" in werkzeugnachricht["content"]
    db.close()


def test_unbekanntes_werkzeug_wird_als_fehler_zurueckgemeldet():
    llm = ScriptedLLM([call("mail_senden", an="x"), text("Dafuer habe ich kein Werkzeug.")])
    agent, db = make(llm)
    antwort = agent.respond("Schick eine Mail")
    assert not antwort.tool_runs[0].ok
    assert "habe ich nicht" in antwort.tool_runs[0].message
    db.close()


def test_endlosschleife_wird_abgebrochen():
    """Ruft das Modell immer nur Werkzeuge auf, bricht der Agent ehrlich ab."""
    llm = ScriptedLLM([call("wetter", ort="a")] * 10)
    agent, db = make(llm)
    antwort = agent.respond("x")
    assert "komme hier nicht weiter" in antwort.text
    assert len(antwort.tool_runs) == agent.max_tool_rounds
    db.close()


def test_fehlende_berechtigung_wird_gemeldet_nicht_umgangen():
    llm = ScriptedLLM([call("loeschen", pfad="/tmp/x"),
                       text("Dafuer fehlt mir die Berechtigung.")])
    agent, db = make(llm, granted=(Scope.READ,))
    antwort = agent.respond("Loesch die Datei")
    assert not antwort.tool_runs[0].ok
    assert "Berechtigung" in antwort.tool_runs[0].message
    # Und es gibt eine dringende Meldung darueber.
    assert any(n.priority is Priority.URGENT for n in agent.notifications.history())
    db.close()


# -- Rueckfrage bei kritischen Aktionen ---------------------------------
def test_loeschen_fragt_zuerst():
    llm = ScriptedLLM([call("loeschen", pfad="/tmp/alt.txt")])
    agent, db = make(llm, granted=(Scope.DELETE,))
    antwort = agent.respond("Loesch /tmp/alt.txt")
    assert antwort.needs_confirmation
    assert "Soll ich das machen?" in antwort.text
    assert agent.pending.tool == "loeschen"
    db.close()


def test_zustimmung_fuehrt_aus():
    llm = ScriptedLLM([call("loeschen", pfad="/tmp/alt.txt")])
    agent, db = make(llm, granted=(Scope.DELETE,))
    agent.respond("Loesch /tmp/alt.txt")
    antwort = agent.respond("Ja, mach")
    assert antwort.text == "Erledigt."
    assert antwort.tool_runs[0].ok
    assert agent.pending is None
    db.close()


def test_ablehnung_fuehrt_nicht_aus():
    llm = ScriptedLLM([call("loeschen", pfad="/tmp/alt.txt")])
    agent, db = make(llm, granted=(Scope.DELETE,))
    agent.respond("Loesch /tmp/alt.txt")
    antwort = agent.respond("Nein, lass")
    assert "lasse ich das" in antwort.text
    assert antwort.tool_runs == []
    assert agent.pending is None
    db.close()


def test_unklare_antwort_fuehrt_nicht_aus():
    """Im Zweifel wird nichts geloescht -- die Aktion verfaellt."""
    llm = ScriptedLLM([call("loeschen", pfad="/tmp/alt.txt"),
                       text("Wie meinst du das?")])
    agent, db = make(llm, granted=(Scope.DELETE,))
    agent.respond("Loesch /tmp/alt.txt")
    antwort = agent.respond("Wie ist das Wetter?")
    assert antwort.tool_runs == []
    assert agent.pending is None
    db.close()


def test_auto_confirm_fragt_nicht():
    llm = ScriptedLLM([call("loeschen", pfad="/tmp/x"), text("Geloescht.")])
    agent, db = make(llm, granted=(Scope.DELETE,), auto_confirm=(Scope.DELETE,))
    antwort = agent.respond("Loesch das")
    assert not antwort.needs_confirmation
    assert antwort.tool_runs[0].ok
    db.close()


# -- Stroemen und Abbruch -----------------------------------------------
def test_text_kommt_stueckweise_heraus():
    llm = ScriptedLLM([[Chunk(text="Moin "), Chunk(text="Noah."), Chunk(done=True)]])
    agent, db = make(llm)
    stuecke = []
    antwort = agent.respond("Moin", on_text=stuecke.append)
    assert stuecke == ["Moin ", "Noah."]
    assert antwort.text == "Moin Noah."
    db.close()


def test_unterbrechung_mitten_im_strom_verwirft_die_antwort():
    """Spricht der Nutzer dazwischen, wird die halbe Antwort weggeworfen."""

    class Dazwischenreden:
        """Modell, bei dem der Nutzer nach dem zweiten Stueck zu sprechen beginnt."""

        def __init__(self, agent_holder: list) -> None:
            self.agent_holder = agent_holder

        def chat(self, messages, *, tools=None, cancel=None):
            for i in range(6):
                if cancel is not None and cancel.is_set():
                    raise LLMCancelled("Nutzer spricht")
                yield Chunk(text=f"Teil {i} ")
                if i == 1:
                    self.agent_holder[0].interrupt()

    holder: list = []
    agent, db = make(Dazwischenreden(holder))
    holder.append(agent)
    stuecke = []
    antwort = agent.respond("Erzaehl was", on_text=stuecke.append)
    assert antwort.cancelled
    # Die angefangene Antwort wird nicht als Ergebnis geliefert ...
    assert antwort.text == ""
    assert len(stuecke) < 6
    # ... und landet auch nicht im Gespraechsverlauf, sonst wuerde sich JARVIS
    # spaeter auf etwas beziehen, was er nie zu Ende gesagt hat.
    assert [t.role for t in agent.short_term.recent()] == ["user"]
    db.close()


def test_alte_unterbrechung_blockiert_die_naechste_runde_nicht():
    """Nach dem Dazwischenreden kommt die naechste Aeusserung -- die muss durch."""
    agent, db = make(ScriptedLLM([text("Ja, bitte?")]))
    agent.interrupt()                      # Nutzer hat die letzte Antwort abgewuergt
    antwort = agent.respond("Stopp, anders")   # und sagt jetzt etwas Neues
    assert not antwort.cancelled
    assert antwort.text == "Ja, bitte?"
    db.close()


def test_modellfehler_wird_ehrlich_gemeldet():
    agent, db = make(BrokenLLM())
    antwort = agent.respond("Moin")
    assert antwort.error is not None
    assert "nicht erreichbar" in antwort.text
    assert any(n.priority is Priority.URGENT for n in agent.notifications.history())
    db.close()


# -- Proaktive Meldungen aus echtem Status ------------------------------
def test_meldung_nur_bei_echter_statusaenderung():
    agent, db = make(ScriptedLLM([]))
    aufgabe = agent.tasks.create("Angebot schreiben")
    vorher = agent.task_snapshot()

    # Keine Aenderung -> keine Meldung, auch wenn ein Modell das Gegenteil sagt.
    assert agent.announce_task_changes(vorher) == []

    agent.tasks.start(aufgabe.id)
    agent.tasks.complete(aufgabe.id, "verschickt", "Postausgang geprueft")
    meldungen = agent.announce_task_changes(vorher)
    assert meldungen == ["Angebot schreiben ist erledigt."]
    db.close()


def test_blockade_ist_dringend():
    agent, db = make(ScriptedLLM([]))
    aufgabe = agent.tasks.create("Mail senden")
    vorher = agent.task_snapshot()
    agent.tasks.start(aufgabe.id)
    agent.tasks.block(aufgabe.id, "Adresse fehlt")
    agent.announce_task_changes(vorher)
    dringend = [n for n in agent.notifications.history() if n.priority is Priority.URGENT]
    assert dringend and "Adresse fehlt" in dringend[0].text
    db.close()


def test_start_allein_ist_keine_meldung_wert():
    agent, db = make(ScriptedLLM([]))
    aufgabe = agent.tasks.create("Etwas")
    vorher = agent.task_snapshot()
    agent.tasks.start(aufgabe.id)
    assert agent.announce_task_changes(vorher) == []
    db.close()


def test_doppelte_meldung_wird_verhindert():
    agent, db = make(ScriptedLLM([]))
    aufgabe = agent.tasks.create("Etwas")
    vorher = agent.task_snapshot()
    agent.tasks.start(aufgabe.id)
    agent.tasks.complete(aufgabe.id, "r", "v")
    assert len(agent.announce_task_changes(vorher)) == 1
    # Zweiter Durchlauf mit demselben Ausgangsstand: keine neue Meldung.
    assert agent.announce_task_changes(vorher) == []
    db.close()


def test_statussatz_nennt_das_hindernis():
    agent, db = make(ScriptedLLM([]))
    a = agent.tasks.create("Auswertung")
    b = agent.tasks.create("Mail")
    agent.tasks.start(a.id)
    agent.tasks.start(b.id)
    agent.tasks.block(b.id, "Adresse fehlt")
    satz = agent.status_sentence()
    assert "1 laeuft" in satz and "1 haengt" in satz
    assert "Adresse fehlt" in satz
    db.close()


def test_statussatz_ohne_aufgaben():
    agent, db = make(ScriptedLLM([]))
    assert agent.status_sentence() == "Es ist nichts offen."
    db.close()
